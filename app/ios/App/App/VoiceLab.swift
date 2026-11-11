// تجربة جدوى المساعد الصوتي (ت3، docs/appstore/roadmap.md 9.1).
// 1) LabBridgeViewController: يحمل اللعبة كما هي، ويفتح صفحة التجربة (lab/voice.html) بضغط ثلاث أصابع ثانية واحدة.
// 2) VoiceLabPlugin: يسمع بالعربية عبر Speech framework، ويفضّل التعرّف على الجهاز دون إنترنت، ويرسل النص إلى الصفحة.
// لا يمس ملفات اللعبة ولا الموقع.
import UIKit
import WebKit
import AVFoundation
import Speech
import Capacitor

class LabBridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VoiceLabPlugin())
        let press = UILongPressGestureRecognizer(target: self, action: #selector(openLab(_:)))
        press.numberOfTouchesRequired = 3
        press.minimumPressDuration = 1.0
        press.cancelsTouchesInView = false
        press.delegate = self
        webView?.addGestureRecognizer(press)
    }

    @objc func openLab(_ g: UILongPressGestureRecognizer) {
        guard g.state == .began, let base = bridge?.config.serverURL else { return }
        webView?.load(URLRequest(url: base.appendingPathComponent("lab/voice.html")))
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}

@objc(VoiceLabPlugin)
public class VoiceLabPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoiceLabPlugin"
    public let jsName = "VoiceLab"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "install", returnType: CAPPluginReturnPromise)
    ]

    // المحرّك الجديد (iOS 26+): SpeechAnalyzer مع DictationTranscriber أو SpeechTranscriber.
    private var fresh: AnyObject?

    // ما يدعمه المحرّك الجديد من العربية، وما نُزّل نموذجه على الهاتف.
    @objc func probe(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else { call.resolve(["available": false]); return }
        Task { call.resolve(await FreshEngine.arabic()) }
    }

    // install({ engine: "dictation" | "transcriber", locale: "ar-SA" }): ينزّل النموذج العربي ليعمل دون إنترنت.
    @objc func install(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else { call.reject("يلزم iOS 26"); return }
        let kind = call.getString("engine") ?? "dictation"
        let id = call.getString("locale") ?? "ar-SA"
        Task {
            do {
                try await FreshEngine.install(kind: kind, locale: Locale(identifier: id))
                call.resolve(await FreshEngine.arabic())
            } catch {
                call.reject("تعذّر تنزيل النموذج: \(error.localizedDescription)")
            }
        }
    }

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var startedAt = Date()
    private var sentFinal = false

    // اللغات العربية التي يعرفها الهاتف، ولكل واحدة: هل تعمل على الجهاز دون إنترنت.
    @objc func status(_ call: CAPPluginCall) {
        let arabic = SFSpeechRecognizer.supportedLocales()
            .filter { $0.identifier.hasPrefix("ar") }
            .sorted { $0.identifier < $1.identifier }
            .map { loc -> [String: Any] in
                let r = SFSpeechRecognizer(locale: loc)
                return [
                    "id": loc.identifier,
                    "onDevice": r?.supportsOnDeviceRecognition ?? false,
                    "available": r?.isAvailable ?? false
                ]
            }
        call.resolve([
            "speech": Self.speechName(SFSpeechRecognizer.authorizationStatus()),
            "mic": Self.micName(),
            "locales": arabic,
            "ios": UIDevice.current.systemVersion,
            "model": UIDevice.current.model
        ])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { s in
            AVAudioSession.sharedInstance().requestRecordPermission { mic in
                call.resolve(["speech": Self.speechName(s), "mic": mic ? "granted" : "denied"])
            }
        }
    }

    // start({ locale: "ar-SA", onDevice: true, hints: ["كرة القدم", …] })
    // يرسل الحدث partial أثناء الكلام، ثم final مرة واحدة بالنص وبدائله وزمنه.
    @objc func start(_ call: CAPPluginCall) {
        task?.cancel()
        cleanup()
        let id = call.getString("locale") ?? "ar-SA"
        let kind = call.getString("engine") ?? "old"
        if kind != "old" {
            guard #available(iOS 26.0, *) else { call.reject("المحرّك الجديد يلزمه iOS 26"); return }
            startFresh(call, kind: kind, id: id); return
        }
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: id)) else {
            call.reject("لا يدعم الهاتف اللغة \(id)"); return
        }
        let onDevice = call.getBool("onDevice") ?? true
        if onDevice && !rec.supportsOnDeviceRecognition {
            call.reject("اللغة \(id) لا تعمل على الجهاز دون إنترنت"); return
        }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = onDevice
        req.taskHint = .search
        req.contextualStrings = Array((call.getArray("hints", String.self) ?? []).prefix(100))
        if #available(iOS 16, *) { req.addsPunctuation = false }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buf, _ in req.append(buf) }
            engine.prepare()
            try engine.start()
        } catch {
            cleanup()
            call.reject("تعذّر تشغيل الميكروفون: \(error.localizedDescription)"); return
        }

        recognizer = rec
        request = req
        sentFinal = false
        startedAt = Date()
        task = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let r = result {
                let best = r.bestTranscription.formattedString
                if r.isFinal {
                    let alts = r.transcriptions.prefix(5).map { $0.formattedString }
                    self.finish(["text": best, "alts": Array(alts), "onDevice": req.requiresOnDeviceRecognition])
                } else {
                    self.notifyListeners("partial", data: ["text": best])
                }
            }
            if let e = error { self.finish(["text": result?.bestTranscription.formattedString ?? "", "alts": [], "error": e.localizedDescription]) }
        }
        call.resolve(["locale": id, "onDevice": onDevice])
    }

    // يوقف السماع ويطلب النتيجة النهائية (تصل بالحدث final).
    @objc func stop(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *), let f = fresh as? FreshEngine {
            stopAudio()
            Task { await f.finish() }
            call.resolve(); return
        }
        stopAudio()
        request?.endAudio()
        call.resolve()
    }

    @objc func cancel(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *), let f = fresh as? FreshEngine { f.onFinal = { _, _ in }; Task { await f.finish() } }
        fresh = nil
        task?.cancel()
        cleanup()
        call.resolve()
    }

    @available(iOS 26.0, *)
    private func startFresh(_ call: CAPPluginCall, kind: String, id: String) {
        let hints = Array((call.getArray("hints", String.self) ?? []).prefix(100))
        let f = FreshEngine()
        f.onPartial = { [weak self] t in self?.notifyListeners("partial", data: ["text": t]) }
        f.onFinal = { [weak self] t, err in
            var d: [String: Any] = ["text": t, "alts": [], "onDevice": true]
            if let e = err { d["error"] = e }
            self?.fresh = nil
            self?.finish(d)
        }
        fresh = f
        sentFinal = false
        startedAt = Date()
        Task {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
                try session.setActive(true, options: .notifyOthersOnDeactivation)
                try await f.start(kind: kind, locale: Locale(identifier: id), hints: hints, engine: self.engine)
                call.resolve(["locale": id, "onDevice": true, "engine": kind])
            } catch {
                self.fresh = nil
                self.cleanup()
                call.reject("\(error.localizedDescription)")
            }
        }
    }

    private func finish(_ data: [String: Any]) {
        DispatchQueue.main.async {
            guard !self.sentFinal else { return }
            self.sentFinal = true
            var d = data
            d["ms"] = Int(Date().timeIntervalSince(self.startedAt) * 1000)
            self.notifyListeners("final", data: d)
            self.cleanup()
        }
    }

    private func stopAudio() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
    }

    private func cleanup() {
        stopAudio()
        task = nil
        request = nil
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func speechName(_ s: SFSpeechRecognizerAuthorizationStatus) -> String {
        switch s {
        case .authorized: return "granted"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "prompt"
        }
    }

    private static func micName() -> String {
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }
}

// المحرّك الجديد في iOS 26: يعمل على الجهاز دائماً، بنموذج يُنزَّل مرة لكل لغة.
@available(iOS 26.0, *)
final class FreshEngine {
    var onPartial: (String) -> Void = { _ in }
    var onFinal: (String, String?) -> Void = { _, _ in }

    private var analyzer: SpeechAnalyzer?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var results: Task<Void, Never>?
    private var converter: AVAudioConverter?
    private weak var audio: AVAudioEngine?
    private var settled = ""   // ما ثبت من النص
    private var volatile = ""  // ما زال يتغيّر
    private var error: String?
    private var ended = false

    static func module(_ kind: String, _ locale: Locale) -> any SpeechModule {
        if kind == "transcriber" {
            return SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
        }
        return DictationTranscriber(locale: locale, preset: .progressiveShortDictation)
    }

    static func arabic() async -> [String: Any] {
        let ar: ([Locale]) -> [String] = { $0.map { $0.identifier }.filter { $0.hasPrefix("ar") }.sorted() }
        return [
            "available": true,
            "dictation": ar(await DictationTranscriber.supportedLocales),
            "dictationInstalled": ar(await DictationTranscriber.installedLocales),
            "transcriber": ar(await SpeechTranscriber.supportedLocales),
            "transcriberInstalled": ar(await SpeechTranscriber.installedLocales)
        ]
    }

    static func install(kind: String, locale: Locale) async throws {
        let m = module(kind, locale)
        if let req = try await AssetInventory.assetInstallationRequest(supporting: [m]) {
            try await req.downloadAndInstall()
        }
    }

    func start(kind: String, locale: Locale, hints: [String], engine: AVAudioEngine) async throws {
        let m = Self.module(kind, locale)
        if try await AssetInventory.assetInstallationRequest(supporting: [m]) != nil {
            throw NSError(domain: "VoiceLab", code: 1, userInfo: [NSLocalizedDescriptionKey: "النموذج العربي غير منزّل بعد: اضغط «نزّل النموذج»"])
        }
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [m]) else {
            throw NSError(domain: "VoiceLab", code: 2, userInfo: [NSLocalizedDescriptionKey: "لا صيغة صوت مناسبة للمحرّك الجديد"])
        }

        // النتائج: الثابت يُضاف، والمتغيّر يُستبدل.
        if let t = m as? DictationTranscriber {
            results = Task { do { for try await r in t.results { self.take(String(r.text.characters), r.isFinal) } } catch { self.error = error.localizedDescription } }
        } else if let t = m as? SpeechTranscriber {
            results = Task { do { for try await r in t.results { self.take(String(r.text.characters), r.isFinal) } } catch { self.error = error.localizedDescription } }
        }

        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        input = cont
        let an = SpeechAnalyzer(modules: [m])
        analyzer = an
        if !hints.isEmpty {
            let ctx = AnalysisContext()
            ctx.contextualStrings[.general] = hints
            try? await an.setContext(ctx)
        }
        try await an.start(inputSequence: stream)

        audio = engine
        let node = engine.inputNode
        node.installTap(onBus: 0, bufferSize: 4096, format: node.outputFormat(forBus: 0)) { [weak self] buf, _ in
            guard let self = self, let out = self.convert(buf, to: format) else { return }
            cont.yield(AnalyzerInput(buffer: out))
        }
        engine.prepare()
        try engine.start()
    }

    private func take(_ text: String, _ isFinal: Bool) {
        if isFinal { settled += (settled.isEmpty ? "" : " ") + text; volatile = "" } else { volatile = text }
        let now = [settled, volatile].filter { !$0.isEmpty }.joined(separator: " ")
        DispatchQueue.main.async { self.onPartial(now) }
    }

    func finish() async {
        guard !ended else { return }
        ended = true
        input?.finish()
        if let an = analyzer {
            do { try await an.finalizeAndFinishThroughEndOfInput() } catch { self.error = error.localizedDescription }
        }
        await results?.value
        let text = [settled, volatile].filter { !$0.isEmpty }.joined(separator: " ")
        let err = text.isEmpty ? error : nil
        DispatchQueue.main.async { self.onFinal(text, err) }
    }

    private func convert(_ buf: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        if buf.format == format { return buf }
        if converter == nil || converter?.inputFormat != buf.format {
            converter = AVAudioConverter(from: buf.format, to: format)
            converter?.primeMethod = .none
        }
        guard let conv = converter else { return nil }
        let cap = AVAudioFrameCount(Double(buf.frameLength) * format.sampleRate / buf.format.sampleRate + 1)
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: cap) else { return nil }
        var fed = false
        var err: NSError?
        conv.convert(to: out, error: &err) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true
            status.pointee = .haveData
            return buf
        }
        return err == nil ? out : nil
    }
}
