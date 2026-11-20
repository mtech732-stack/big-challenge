// المساعد الصوتي في المزاد (الوثيقة 5.5.1، design/app.md 7، ت5).
// VoiceBridgeViewController يحمل اللعبة كما هي ويضيف إليها إضافة «Voice»، تسمع بالعربية على الجهاز دون إنترنت
// بمحرّك آبل الجديد (SpeechAnalyzer، iOS 26 فأحدث). والصفحة (index.html) تطابق ما يُسمع بقائمة الموضوع.
// إن كان الجهاز أقدم من iOS 26 أو لا عربية فيه: status تعيد available: false، فلا يظهر المساعد ويُلعب المزاد كما هو.
// منقول من تجربة الجدوى (ت3، VoiceLab.swift على فرعها) بالمحرّك الجديد وحده.
import UIKit
import AVFoundation
import Speech
import Capacitor

class VoiceBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VoicePlugin())
    }
}

@objc(VoicePlugin)
public class VoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoicePlugin"
    public let jsName = "Voice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "install", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    // محرّك صوت جديد لكل جلسة (ملاحظة المالك 13 نوفمبر: لم يُسمع إلا السؤال الأول). بين السؤالين تعود فئة الصوت إلى ما كانت،
    // ومحرّك آبل إذا تغيّرت الفئة تحته يبقى بصيغة إدخال قديمة، فقد يعمل ولا يصله صوت. والجديد يأخذ صيغة الميكروفون الحالية.
    private var audio = AVAudioEngine()
    private var tapped = false
    private var engine: AnyObject?
    private var watch: NSKeyValueObservation?
    // فئة الصوت قبل السماع، تعود بعده فلا يتغير صوت اللعبة.
    private var before: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

    // { available, installed, mic: granted | denied | prompt, locale }
    @objc func status(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else { call.resolve(["available": false]); return }
        Task {
            guard let loc = await VoiceEngine.arabic() else { call.resolve(["available": false]); return }
            call.resolve(["available": true, "installed": await VoiceEngine.installed(loc), "mic": Self.mic(), "locale": loc.identifier])
        }
    }

    // ينزّل النموذج العربي مرة واحدة (يلزمه الإنترنت)، ويرسل الحدث progress { pct } أثناءه.
    @objc func install(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else { call.reject("يلزم iOS 26"); return }
        Task {
            guard let loc = await VoiceEngine.arabic() else { call.reject("لا عربية في الجهاز"); return }
            do {
                guard let req = try await AssetInventory.assetInstallationRequest(supporting: [VoiceEngine.module(loc)]) else { call.resolve(); return }
                self.watch = req.progress.observe(\.fractionCompleted, options: [.initial, .new]) { [weak self] p, _ in
                    self?.notifyListeners("progress", data: ["pct": Int(p.fractionCompleted * 100)])
                }
                try await req.downloadAndInstall()
                self.watch = nil
                call.resolve()
            } catch {
                self.watch = nil
                call.reject("تعذّر تنزيل النموذج: \(error.localizedDescription)")
            }
        }
    }

    // يطلب إذن الميكروفون (وإذن التعرّف على الكلام معه). يعيد { mic, speech }.
    @objc func requestAccess(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { s in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                call.resolve(["mic": granted ? "granted" : "denied", "speech": s == .authorized ? "granted" : "denied"])
            }
        }
    }

    // start({ id, hints: [أسماء القائمة وبدائلها] }): يسمع حتى stop، ويرسل partial { id, text } بالنص كله منذ البدء، ثم final { id, text } مرة.
    // id رقم الجلسة من الصفحة: نهاية جلسة سابقة (final) قد تصل بعد بدء التالية، فتعرف الصفحة أنها ليست لها (ش8-أ/98 و99).
    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else { call.reject("يلزم iOS 26"); return }
        if let old = engine as? VoiceEngine { old.onFinal = { _, _ in }; Task { await old.finish() } }
        stopAudio()
        audio = AVAudioEngine()
        let hints = Array((call.getArray("hints", String.self) ?? []).prefix(100))
        let id = call.getString("id") ?? ""
        let e = VoiceEngine()
        e.onPartial = { [weak self] t in self?.notifyListeners("partial", data: ["id": id, "text": t]) }
        e.onFinal = { [weak self, weak e] t, err in
            guard let self = self else { return }
            var d: [String: Any] = ["id": id, "text": t]
            if let err = err { d["error"] = err }
            self.notifyListeners("final", data: d)
            // تعود فئة الصوت كما كانت إن لم تبدأ بعدها جلسة أخرى. وإلا قطعت الجلسةَ الجديدة فلا يُسمع شيء (ش8-أ/99:
            // في الموضوع التالي كانت نهاية الأول تصل بعد بدء الثاني فتعيد الفئة وتوقف تسجيله).
            if self.engine == nil || self.engine === e { self.restore() }
        }
        engine = e
        Task {
            do {
                guard let loc = await VoiceEngine.arabic() else { throw VoiceEngine.fail("لا عربية في الجهاز") }
                let session = AVAudioSession.sharedInstance()
                if self.before == nil { self.before = (session.category, session.mode, session.categoryOptions) }
                // يبقى صوت اللعبة على التلفاز (AirPlay) ومكبّر الهاتف أثناء السماع.
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowAirPlay, .allowBluetoothA2DP, .mixWithOthers])
                try session.setActive(true)
                guard self.engine === e else { call.resolve(); return }   // بدأت بعدها جلسة أخرى
                self.tapped = true
                try await e.start(locale: loc, hints: hints, audio: self.audio)
                call.resolve()
            } catch {
                self.engine = nil
                self.stopAudio()
                self.restore()
                call.reject(error.localizedDescription)
            }
        }
    }

    // يوقف السماع، والنص الأخير يصل بالحدث final.
    @objc func stop(_ call: CAPPluginCall) {
        stopAudio()
        if #available(iOS 26.0, *), let e = engine as? VoiceEngine { engine = nil; Task { await e.finish() } }
        call.resolve()
    }

    // لا يُلمس inputNode إلا إن رُكّب عليه السماع: لمسه وفئة الصوت للعب وحده قد يثبّت صيغة بلا ميكروفون.
    private func stopAudio() {
        if audio.isRunning { audio.stop() }
        if tapped { audio.inputNode.removeTap(onBus: 0); tapped = false }
    }

    private func restore() {
        guard let b = before else { return }
        before = nil
        try? AVAudioSession.sharedInstance().setCategory(b.0, mode: b.1, options: b.2)
    }

    private static func mic() -> String {
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }
}

// محرّك آبل الجديد: DictationTranscriber على الجهاز، بنموذج عربي يُنزَّل مرة.
@available(iOS 26.0, *)
final class VoiceEngine {
    var onPartial: (String) -> Void = { _ in }
    var onFinal: (String, String?) -> Void = { _, _ in }

    private var analyzer: SpeechAnalyzer?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var results: Task<Void, Never>?
    private var converter: AVAudioConverter?
    private var settled = ""   // ما ثبت من النص
    private var volatile = ""  // ما زال يتغيّر
    private var error: String?
    private var ended = false

    static func fail(_ text: String) -> NSError { NSError(domain: "Voice", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    static func module(_ locale: Locale) -> DictationTranscriber { DictationTranscriber(locale: locale, preset: .progressiveShortDictation) }

    // العربية التي يدعمها المحرّك: السعودية أولاً (كما جُرّبت في ت3)، ثم أي عربية.
    static func arabic() async -> Locale? {
        let ids = await DictationTranscriber.supportedLocales.map { $0.identifier }.filter { $0.hasPrefix("ar") }.sorted()
        guard let id = ids.first(where: { $0.contains("SA") }) ?? ids.first else { return nil }
        return Locale(identifier: id)
    }

    static func installed(_ locale: Locale) async -> Bool {
        (try? await AssetInventory.assetInstallationRequest(supporting: [module(locale)])) == nil
    }

    func start(locale: Locale, hints: [String], audio: AVAudioEngine) async throws {
        let m = Self.module(locale)
        if try await AssetInventory.assetInstallationRequest(supporting: [m]) != nil { throw Self.fail("النموذج العربي غير منزّل") }
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [m]) else { throw Self.fail("لا صيغة صوت مناسبة") }
        results = Task { do { for try await r in m.results { self.take(String(r.text.characters), r.isFinal) } } catch { self.error = error.localizedDescription } }
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
        let node = audio.inputNode
        node.installTap(onBus: 0, bufferSize: 4096, format: node.outputFormat(forBus: 0)) { [weak self] buf, _ in
            guard let self = self, let out = self.convert(buf, to: format) else { return }
            cont.yield(AnalyzerInput(buffer: out))
        }
        audio.prepare()
        try audio.start()
    }

    // الثابت يُضاف، والمتغيّر يُستبدل، والصفحة تأخذ النص كله.
    private func take(_ text: String, _ isFinal: Bool) {
        if isFinal { settled += (settled.isEmpty ? "" : " ") + text; volatile = "" } else { volatile = text }
        let now = [settled, volatile].filter { !$0.isEmpty }.joined(separator: " ")
        DispatchQueue.main.async { self.onPartial(now) }
    }

    func finish() async {
        guard !ended else { return }
        ended = true
        input?.finish()
        if let an = analyzer { do { try await an.finalizeAndFinishThroughEndOfInput() } catch { self.error = error.localizedDescription } }
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
