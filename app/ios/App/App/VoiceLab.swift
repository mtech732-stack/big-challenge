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
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

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
        stopAudio()
        request?.endAudio()
        call.resolve()
    }

    @objc func cancel(_ call: CAPPluginCall) {
        task?.cancel()
        cleanup()
        call.resolve()
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
