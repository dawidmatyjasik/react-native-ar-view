# iOS ARKit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full ARKit feature parity with the existing Android ARCore implementation.

**Architecture:** SceneKit + ARKit for rendering/tracking, GLTFKit2 (vendored xcframework) for GLB/GLTF model loading. Mirrors Android's 4-file structure: Module, View, ModelConfig, ARSceneState.

**Tech Stack:** Swift 5.9, ARKit, SceneKit, GLTFKit2 0.5.15, ExpoModulesCore

**Design doc:** `docs/plans/2026-02-28-ios-arkit-design.md`

---

### Task 1: Download GLTFKit2 xcframework

**Files:**
- Create: `ios/Frameworks/GLTFKit2.xcframework/` (vendored binary)
- Create: `ios/setup-frameworks.sh` (download helper)
- Modify: `.gitignore`

**Step 1: Create the Frameworks directory and download script**

```bash
mkdir -p ios/Frameworks
```

Create `ios/setup-frameworks.sh`:
```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAMEWORKS_DIR="$SCRIPT_DIR/Frameworks"
GLTFKIT2_VERSION="0.5.15"
GLTFKIT2_URL="https://github.com/warrenm/GLTFKit2/releases/download/${GLTFKIT2_VERSION}/GLTFKit2.xcframework.zip"

if [ -d "$FRAMEWORKS_DIR/GLTFKit2.xcframework" ]; then
    echo "GLTFKit2.xcframework already exists, skipping download"
    exit 0
fi

echo "Downloading GLTFKit2 v${GLTFKIT2_VERSION}..."
mkdir -p "$FRAMEWORKS_DIR"
curl -L -o "$FRAMEWORKS_DIR/GLTFKit2.xcframework.zip" "$GLTFKIT2_URL"
unzip -o "$FRAMEWORKS_DIR/GLTFKit2.xcframework.zip" -d "$FRAMEWORKS_DIR"
rm "$FRAMEWORKS_DIR/GLTFKit2.xcframework.zip"
echo "GLTFKit2.xcframework downloaded successfully"
```

**Step 2: Make executable and run**

```bash
chmod +x ios/setup-frameworks.sh
./ios/setup-frameworks.sh
```

Expected: GLTFKit2.xcframework appears in `ios/Frameworks/`

**Step 3: Add to .gitignore**

Add to `.gitignore`:
```
ios/Frameworks/
```

**Step 4: Commit**

```bash
git add ios/setup-frameworks.sh .gitignore
git commit -m "chore: add GLTFKit2 xcframework download script"
```

---

### Task 2: Update podspec

**Files:**
- Modify: `ios/ReactNativeArView.podspec`

**Step 1: Update the podspec**

Replace the full contents of `ios/ReactNativeArView.podspec`:

```ruby
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ReactNativeArView'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/dawidmatyjasik/react-native-ar-view' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'ARKit', 'SceneKit'
  s.vendored_frameworks = 'Frameworks/GLTFKit2.xcframework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"

  s.prepare_command = <<-CMD
    bash setup-frameworks.sh
  CMD
end
```

Note: `source_files` changed from `**/*.{...}` to `*.{...}` so it doesn't pick up files inside `Frameworks/`. The `prepare_command` downloads GLTFKit2 automatically (only runs for published pods — for dev pods, run `setup-frameworks.sh` manually). Removed tvOS platform since ARKit is iOS-only.

**Step 2: Verify podspec is valid**

Run from project root:
```bash
cd example/ios && pod install
```

Expected: Pod installs without errors (may warn about missing Swift files — that's OK, we haven't written them yet).

**Step 3: Commit**

```bash
git add ios/ReactNativeArView.podspec
git commit -m "chore: update podspec for ARKit, SceneKit, GLTFKit2"
```

---

### Task 3: Create ModelConfig.swift

**Files:**
- Create: `ios/ModelConfig.swift`

**Step 1: Write ModelConfig**

Create `ios/ModelConfig.swift`:

```swift
import Foundation

struct ModelConfig {
    let id: String
    let sourceUri: String
    let placement: String
    let scale: Float
    let rotation: [Float]
    let gestureScale: Bool
    let gestureRotate: Bool
    let gestureScaleMin: Float
    let gestureScaleMax: Float
    let gestureScaleSensitivity: Float

    var sourceURL: URL? {
        if sourceUri.hasPrefix("asset://") {
            // Expo asset ID — resolve via asset system
            // The asset:// prefix is stripped and the numeric ID is used
            return nil // Resolved at load time via Expo asset system
        }
        return URL(string: sourceUri)
    }

    static func from(_ dict: [String: Any]) -> ModelConfig {
        let rotation: [Float]
        if let rotList = dict["rotation"] as? [Any] {
            rotation = [
                (rotList[safe: 0] as? NSNumber)?.floatValue ?? 0,
                (rotList[safe: 1] as? NSNumber)?.floatValue ?? 0,
                (rotList[safe: 2] as? NSNumber)?.floatValue ?? 0
            ]
        } else {
            rotation = [0, 0, 0]
        }

        return ModelConfig(
            id: dict["id"] as? String ?? "",
            sourceUri: dict["sourceUri"] as? String ?? "",
            placement: dict["placement"] as? String ?? "tap",
            scale: (dict["scale"] as? NSNumber)?.floatValue ?? 1.0,
            rotation: rotation,
            gestureScale: dict["gestureScale"] as? Bool ?? false,
            gestureRotate: dict["gestureRotate"] as? Bool ?? false,
            gestureScaleMin: (dict["gestureScaleMin"] as? NSNumber)?.floatValue ?? 0.1,
            gestureScaleMax: (dict["gestureScaleMax"] as? NSNumber)?.floatValue ?? 10.0,
            gestureScaleSensitivity: (dict["gestureScaleSensitivity"] as? NSNumber)?.floatValue ?? 1.0
        )
    }
}

// Safe array subscript
private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
```

**Step 2: Commit**

```bash
git add ios/ModelConfig.swift
git commit -m "feat(ios): add ModelConfig data model"
```

---

### Task 4: Create ARSceneState.swift

**Files:**
- Create: `ios/ARSceneState.swift`

**Step 1: Write ARSceneState**

Create `ios/ARSceneState.swift`:

```swift
import ARKit
import SceneKit

/// Wraps an ARAnchor and its associated SCNNode for scene stack management
struct AnchorNodePair {
    let anchor: ARAnchor
    let node: SCNNode
}

/// Snapshot of scene state for push/pop stack management
struct ARSceneState {
    let models: [ModelConfig]
    let anchorNodes: [AnchorNodePair]
}
```

**Step 2: Commit**

```bash
git add ios/ARSceneState.swift
git commit -m "feat(ios): add ARSceneState data model"
```

---

### Task 5: Implement ReactNativeArView.swift — Skeleton + ARSCNView + Lifecycle

**Files:**
- Modify: `ios/ReactNativeArView.swift` (replace WebView stub)

**Step 1: Replace the entire file**

Replace contents of `ios/ReactNativeArView.swift` with the view skeleton:

```swift
import ExpoModulesCore
import ARKit
import SceneKit
import GLTFKit2

class ReactNativeArView: ExpoView, ARSCNViewDelegate, ARSessionDelegate {

    static let TAG = "ReactNativeArView"
    static weak var currentInstance: ReactNativeArView?

    // MARK: - Events
    let onTrackingStateChange = EventDispatcher()
    let onPlaneDetected = EventDispatcher()
    let onModelLoaded = EventDispatcher()
    let onModelPlaced = EventDispatcher()
    let onModelError = EventDispatcher()
    let onSceneChange = EventDispatcher()
    let onARError = EventDispatcher()

    // MARK: - AR View
    private(set) var arSceneView: ARSCNView!

    // MARK: - Scene management
    private var sceneStack: [ARSceneState] = []
    private var currentModels: [ModelConfig] = []
    private var placedAnchors: [AnchorNodePair] = []

    // MARK: - Pending models for tap-to-place
    private var pendingModelConfigs: [ModelConfig] = []
    private var currentPendingIndex = 0

    // MARK: - Gesture state
    private var nodeConfigMap: [SCNNode: ModelConfig] = [:]
    private var activeScaleNode: SCNNode?

    // MARK: - Tracking state
    private var lastTrackingState: String = "unavailable"
    private var detectedPlaneIds = Set<String>()

    // MARK: - Plane visualization
    private var planeNodes: [UUID: SCNNode] = [:]
    private var planesVisible = true

    // MARK: - Session started flag
    private var sessionStarted = false

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        ReactNativeArView.currentInstance = self
        clipsToBounds = true

        arSceneView = ARSCNView()
        arSceneView.delegate = self
        arSceneView.session.delegate = self
        arSceneView.autoenablesDefaultLighting = true
        arSceneView.automaticallyUpdatesLighting = true
        addSubview(arSceneView)

        setupGestures()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        arSceneView.frame = bounds

        if !sessionStarted && bounds.size != .zero {
            sessionStarted = true
            startARSession()
        }
    }

    override func removeFromSuperview() {
        arSceneView.session.pause()
        if ReactNativeArView.currentInstance === self {
            ReactNativeArView.currentInstance = nil
        }
        super.removeFromSuperview()
    }

    private func startARSession() {
        guard ARWorldTrackingConfiguration.isSupported else {
            onARError([
                "code": "AR_NOT_SUPPORTED",
                "message": "ARWorldTrackingConfiguration is not supported on this device"
            ])
            return
        }

        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        config.environmentTexturing = .automatic

        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }

        arSceneView.session.run(config)
    }

    // MARK: - Gesture setup (implemented in Task 9)
    private func setupGestures() {
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        arSceneView.addGestureRecognizer(tapGesture)

        let pinchGesture = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        arSceneView.addGestureRecognizer(pinchGesture)

        let rotationGesture = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:)))
        arSceneView.addGestureRecognizer(rotationGesture)
    }

    // MARK: - Placeholder gesture handlers (filled in Task 8 & 9)
    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        handleTapToPlace(gesture)
    }

    @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
        handlePinchScale(gesture)
    }

    @objc private func handleRotation(_ gesture: UIRotationGestureRecognizer) {
        handleRotationGesture(gesture)
    }

    // ==========================================
    // MARK: - ARSessionDelegate (Tracking State)
    // ==========================================

    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let newState: String
        switch camera.trackingState {
        case .normal:
            newState = "normal"
        case .limited(let reason):
            newState = "limited"
            let reasonStr: String
            switch reason {
            case .initializing:
                reasonStr = "initializing"
            case .excessiveMotion:
                reasonStr = "excessive_motion"
            case .insufficientFeatures:
                reasonStr = "insufficient_features"
            case .relocalizing:
                reasonStr = "relocalizing"
            @unknown default:
                reasonStr = "unknown"
            }
            if newState != lastTrackingState {
                lastTrackingState = newState
                onTrackingStateChange(["state": newState, "reason": reasonStr])
            }
            return
        case .notAvailable:
            newState = "unavailable"
        }

        if newState != lastTrackingState {
            lastTrackingState = newState
            onTrackingStateChange(["state": newState])
        }
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        onARError([
            "code": "AR_SESSION_FAILED",
            "message": error.localizedDescription
        ])
    }

    // ========================================
    // MARK: - ARSCNViewDelegate (Plane Detection)
    // ========================================

    func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
        guard let planeAnchor = anchor as? ARPlaneAnchor else { return }
        let planeId = planeAnchor.identifier.uuidString

        // Send plane detected event
        if !detectedPlaneIds.contains(planeId) {
            detectedPlaneIds.insert(planeId)
            let type: String = planeAnchor.alignment == .vertical ? "vertical" : "horizontal"
            onPlaneDetected(["id": planeId, "type": type])
        }

        // Visualize the plane
        if planesVisible {
            let planeGeometry = SCNPlane(
                width: CGFloat(planeAnchor.planeExtent.width),
                height: CGFloat(planeAnchor.planeExtent.height)
            )
            planeGeometry.firstMaterial?.diffuse.contents = UIColor(white: 1.0, alpha: 0.3)
            planeGeometry.firstMaterial?.isDoubleSided = true

            let planeNode = SCNNode(geometry: planeGeometry)
            planeNode.eulerAngles.x = -.pi / 2
            node.addChildNode(planeNode)
            planeNodes[planeAnchor.identifier] = planeNode
        }
    }

    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let planeAnchor = anchor as? ARPlaneAnchor,
              let planeNode = planeNodes[planeAnchor.identifier],
              let planeGeometry = planeNode.geometry as? SCNPlane else { return }

        planeGeometry.width = CGFloat(planeAnchor.planeExtent.width)
        planeGeometry.height = CGFloat(planeAnchor.planeExtent.height)
        planeNode.simdPosition = planeAnchor.center
    }

    func renderer(_ renderer: SCNSceneRenderer, didRemove node: SCNNode, for anchor: ARAnchor) {
        guard let planeAnchor = anchor as? ARPlaneAnchor else { return }
        planeNodes.removeValue(forKey: planeAnchor.identifier)
    }

    private func hidePlaneOverlays() {
        planesVisible = false
        for (_, node) in planeNodes {
            node.removeFromParentNode()
        }
        planeNodes.removeAll()
    }

    // ==========================================
    // MARK: - Tap-to-Place + Model Loading
    // ==========================================

    private func handleTapToPlace(_ gesture: UITapGestureRecognizer) {
        guard gesture.state == .ended else { return }
        guard !pendingModelConfigs.isEmpty, currentPendingIndex < pendingModelConfigs.count else { return }

        let location = gesture.location(in: arSceneView)

        // Check if tapped on existing model — if so, select it for gestures
        let hitResults = arSceneView.hitTest(location, options: [
            .searchMode: SCNHitTestSearchMode.closest.rawValue
        ])
        if let hit = hitResults.first, let modelNode = findModelNode(for: hit.node) {
            activeScaleNode = modelNode
            return
        }

        // Raycast for plane placement
        guard let query = arSceneView.raycastQuery(
            from: location,
            allowing: .existingPlaneGeometry,
            alignment: .any
        ) else { return }

        let results = arSceneView.session.raycast(query)
        guard let result = results.first else { return }

        let config = pendingModelConfigs[currentPendingIndex]
        currentPendingIndex += 1

        let anchor = ARAnchor(name: "model_\(config.id)", transform: result.worldTransform)
        arSceneView.session.add(anchor: anchor)

        loadAndPlaceModel(anchor: anchor, config: config)
    }

    private func findModelNode(for node: SCNNode) -> SCNNode? {
        var current: SCNNode? = node
        while let n = current {
            if nodeConfigMap[n] != nil { return n }
            current = n.parent
        }
        return nil
    }

    private func loadAndPlaceModel(anchor: ARAnchor, config: ModelConfig) {
        let modelId = config.id.isEmpty ? String(config.sourceUri.hashValue) : config.id

        Task { @MainActor in
            do {
                let modelNode = try await loadModel(config: config)

                // Apply scale
                let s = config.scale
                modelNode.scale = SCNVector3(s, s, s)

                // Apply rotation (euler angles in radians)
                if config.rotation.contains(where: { $0 != 0 }) {
                    modelNode.eulerAngles = SCNVector3(
                        config.rotation[0],
                        config.rotation[1],
                        config.rotation[2]
                    )
                }

                // Find the node that ARKit created for our anchor
                guard let anchorNode = arSceneView.node(for: anchor) else {
                    onModelError([
                        "modelId": modelId,
                        "code": "ANCHOR_NODE_NOT_FOUND",
                        "message": "Could not find SCNNode for anchor"
                    ])
                    return
                }

                anchorNode.addChildNode(modelNode)
                nodeConfigMap[modelNode] = config
                activeScaleNode = modelNode
                placedAnchors.append(AnchorNodePair(anchor: anchor, node: anchorNode))

                // Hide plane overlays after first placement
                hidePlaneOverlays()

                onModelLoaded(["modelId": modelId])
                onModelPlaced([
                    "modelId": modelId,
                    "anchorId": anchor.identifier.uuidString
                ])
            } catch {
                onModelError([
                    "modelId": modelId,
                    "code": "MODEL_LOAD_FAILED",
                    "message": error.localizedDescription
                ])
            }
        }
    }

    private func loadModel(config: ModelConfig) async throws -> SCNNode {
        let url: URL

        if config.sourceUri.hasPrefix("asset://") {
            // Expo asset: resolve to local file
            let assetId = String(config.sourceUri.dropFirst("asset://".count))
            guard let localPath = resolveExpoAsset(id: assetId) else {
                throw NSError(domain: TAG, code: -1, userInfo: [
                    NSLocalizedDescriptionKey: "Could not resolve asset://\(assetId)"
                ])
            }
            url = URL(fileURLWithPath: localPath)
        } else if config.sourceUri.hasPrefix("http://") || config.sourceUri.hasPrefix("https://") {
            // Remote URL: download to temp file
            url = try await downloadToTemp(urlString: config.sourceUri)
        } else {
            // Local file path
            url = URL(fileURLWithPath: config.sourceUri)
        }

        // Load GLTF/GLB using GLTFKit2
        let asset = try await loadGLTFAsset(from: url)
        let scene = SCNScene(gltfAsset: asset)
        let rootNode = SCNNode()
        for child in scene.rootNode.childNodes {
            rootNode.addChildNode(child.clone())
        }
        return rootNode
    }

    private func loadGLTFAsset(from url: URL) async throws -> GLTFAsset {
        try await withCheckedThrowingContinuation { continuation in
            GLTFAsset.load(with: url, options: [:]) { _, status, maybeAsset, maybeError, _ in
                switch status {
                case .complete:
                    if let asset = maybeAsset {
                        continuation.resume(returning: asset)
                    } else {
                        continuation.resume(throwing: NSError(
                            domain: ReactNativeArView.TAG, code: -1,
                            userInfo: [NSLocalizedDescriptionKey: "GLTFAsset loaded but was nil"]
                        ))
                    }
                case .error:
                    continuation.resume(throwing: maybeError ?? NSError(
                        domain: ReactNativeArView.TAG, code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "Unknown GLTF loading error"]
                    ))
                default:
                    break // progress update, ignore
                }
            }
        }
    }

    private func downloadToTemp(urlString: String) async throws -> URL {
        guard let remoteURL = URL(string: urlString) else {
            throw NSError(domain: Self.TAG, code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Invalid URL: \(urlString)"
            ])
        }

        let (tempURL, _) = try await URLSession.shared.download(from: remoteURL)

        // Move to a temp location with the correct extension
        let ext = remoteURL.pathExtension.isEmpty ? "glb" : remoteURL.pathExtension
        let destURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(ext)
        try FileManager.default.moveItem(at: tempURL, to: destURL)
        return destURL
    }

    private func resolveExpoAsset(id: String) -> String? {
        // Expo assets are bundled — look in the main bundle
        // The numeric ID maps to a bundled resource
        // During development, assets are served via the dev server
        // For production, they're in the app bundle
        guard let numericId = Int(id) else { return nil }

        // Try common model extensions
        let extensions = ["glb", "gltf"]
        for ext in extensions {
            if let path = Bundle.main.path(forResource: "\(numericId)", ofType: ext) {
                return path
            }
        }

        return nil
    }

    // ==========================================
    // MARK: - Gesture Handling
    // ==========================================

    private func handlePinchScale(_ gesture: UIPinchGestureRecognizer) {
        guard let node = activeScaleNode,
              let config = nodeConfigMap[node],
              config.gestureScale else { return }

        switch gesture.state {
        case .changed:
            let rawFactor = Float(gesture.scale)
            let sensitivity = config.gestureScaleSensitivity
            let dampenedFactor = 1.0 + (rawFactor - 1.0) * sensitivity

            let currentScale = node.scale.x
            let newScale = min(max(currentScale * dampenedFactor, config.gestureScaleMin), config.gestureScaleMax)
            node.scale = SCNVector3(newScale, newScale, newScale)

            gesture.scale = 1.0 // Reset for incremental updates
        default:
            break
        }
    }

    private func handleRotationGesture(_ gesture: UIRotationGestureRecognizer) {
        guard let node = activeScaleNode,
              let config = nodeConfigMap[node],
              config.gestureRotate else { return }

        switch gesture.state {
        case .changed:
            // Rotate around Y axis (vertical axis in AR)
            node.eulerAngles.y -= Float(gesture.rotation)
            gesture.rotation = 0 // Reset for incremental updates
        default:
            break
        }
    }

    // ==========================================
    // MARK: - Scene Stack Management
    // ==========================================

    func setModels(_ models: [ModelConfig]) {
        pendingModelConfigs = models
        currentPendingIndex = 0
        currentModels = models

        // Re-enable plane overlays so user can see surfaces to tap
        if !models.isEmpty {
            planesVisible = true
            // Re-run plane detection config if needed
            if let config = arSceneView.session.configuration as? ARWorldTrackingConfiguration {
                config.planeDetection = [.horizontal, .vertical]
                arSceneView.session.run(config)
            }
        }
    }

    func pushScene(_ models: [ModelConfig]) {
        // Save current state
        sceneStack.append(ARSceneState(
            models: currentModels,
            anchorNodes: placedAnchors
        ))

        // Hide current anchors
        for pair in placedAnchors {
            pair.node.isHidden = true
        }

        placedAnchors = []
        setModels(models)

        onSceneChange(["action": "push", "depth": sceneStack.count])
    }

    func popScene() -> Bool {
        guard let previous = sceneStack.popLast() else { return false }

        // Destroy current anchors
        for pair in placedAnchors {
            cleanupAnchorNodeConfigs(pair.node)
            pair.node.removeFromParentNode()
            arSceneView.session.remove(anchor: pair.anchor)
        }
        placedAnchors = []

        // Restore previous scene
        currentModels = previous.models
        pendingModelConfigs = []
        currentPendingIndex = 0

        for pair in previous.anchorNodes {
            pair.node.isHidden = false
            placedAnchors.append(pair)
        }

        onSceneChange(["action": "pop", "depth": sceneStack.count])
        return true
    }

    func replaceScene(_ models: [ModelConfig]) {
        // Destroy current anchors
        for pair in placedAnchors {
            cleanupAnchorNodeConfigs(pair.node)
            pair.node.removeFromParentNode()
            arSceneView.session.remove(anchor: pair.anchor)
        }
        placedAnchors = []

        setModels(models)

        onSceneChange(["action": "replace", "depth": sceneStack.count])
    }

    func popToTop() {
        guard !sceneStack.isEmpty else { return }

        // Destroy current anchors
        for pair in placedAnchors {
            cleanupAnchorNodeConfigs(pair.node)
            pair.node.removeFromParentNode()
            arSceneView.session.remove(anchor: pair.anchor)
        }
        placedAnchors = []

        // Destroy all intermediate scenes
        while sceneStack.count > 1 {
            let state = sceneStack.removeLast()
            for pair in state.anchorNodes {
                cleanupAnchorNodeConfigs(pair.node)
                pair.node.removeFromParentNode()
                arSceneView.session.remove(anchor: pair.anchor)
            }
        }

        // Restore first scene
        let first = sceneStack.removeLast()
        currentModels = first.models
        pendingModelConfigs = []
        currentPendingIndex = 0

        for pair in first.anchorNodes {
            pair.node.isHidden = false
            placedAnchors.append(pair)
        }

        onSceneChange(["action": "popToTop", "depth": 0])
    }

    private func cleanupAnchorNodeConfigs(_ node: SCNNode) {
        for child in node.childNodes {
            nodeConfigMap.removeValue(forKey: child)
        }
    }
}
```

**Step 2: Commit**

```bash
git add ios/ReactNativeArView.swift
git commit -m "feat(ios): implement ReactNativeArView with ARKit, SceneKit, GLTFKit2"
```

---

### Task 6: Implement ReactNativeArViewModule.swift

**Files:**
- Modify: `ios/ReactNativeArViewModule.swift` (replace stub)

**Step 1: Replace the entire file**

Replace contents of `ios/ReactNativeArViewModule.swift`:

```swift
import ExpoModulesCore

public class ReactNativeArViewModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ReactNativeArView")

        Events(
            "onTrackingStateChange",
            "onPlaneDetected",
            "onModelLoaded",
            "onModelPlaced",
            "onModelError",
            "onSceneChange",
            "onARError"
        )

        AsyncFunction("pushScene") { (models: [[String: Any]]) in
            let configs = models.map { ModelConfig.from($0) }
            DispatchQueue.main.async {
                Self.getView()?.pushScene(configs)
            }
        }

        AsyncFunction("popScene") { () -> Bool in
            var result = false
            await MainActor.run {
                result = Self.getView()?.popScene() ?? false
            }
            return result
        }

        AsyncFunction("replaceScene") { (models: [[String: Any]]) in
            let configs = models.map { ModelConfig.from($0) }
            DispatchQueue.main.async {
                Self.getView()?.replaceScene(configs)
            }
        }

        AsyncFunction("popToTop") { () in
            DispatchQueue.main.async {
                Self.getView()?.popToTop()
            }
        }

        View(ReactNativeArView.self) {
            Events(
                "onTrackingStateChange",
                "onPlaneDetected",
                "onModelLoaded",
                "onModelPlaced",
                "onModelError",
                "onSceneChange",
                "onARError"
            )
        }
    }

    private static func getView() -> ReactNativeArView? {
        return ReactNativeArView.currentInstance
    }
}
```

**Step 2: Commit**

```bash
git add ios/ReactNativeArViewModule.swift
git commit -m "feat(ios): implement ReactNativeArViewModule with events and async functions"
```

---

### Task 7: Update example app Info.plist for AR

**Files:**
- Modify: `example/ios/reactnativearviewexample/Info.plist`
- Modify: `example/app.json` (Expo config plugin for camera permission)

**Step 1: Add camera usage description and AR capability to Info.plist**

Add the following keys to `example/ios/reactnativearviewexample/Info.plist` inside the `<dict>`:

```xml
<key>NSCameraUsageDescription</key>
<string>This app uses the camera for augmented reality experiences.</string>
<key>UIRequiredDeviceCapabilities</key>
<array>
    <string>arm64</string>
    <string>arkit</string>
</array>
```

Note: Replace the existing `UIRequiredDeviceCapabilities` (which only has `arm64`) with the above that adds `arkit`.

**Step 2: Update app.json with iOS camera permission**

Add to the `ios` section of `example/app.json`:

```json
"infoPlist": {
    "NSCameraUsageDescription": "This app uses the camera for augmented reality experiences.",
    "UIRequiredDeviceCapabilities": ["arm64", "arkit"]
}
```

**Step 3: Commit**

```bash
git add example/ios/reactnativearviewexample/Info.plist example/app.json
git commit -m "feat(ios): add camera permission and ARKit device capability"
```

---

### Task 8: Build verification

**Step 1: Run setup script for GLTFKit2**

```bash
cd ios && bash setup-frameworks.sh && cd ..
```

Expected: GLTFKit2.xcframework downloaded to `ios/Frameworks/`

**Step 2: Pod install**

```bash
cd example/ios && pod install && cd ../..
```

Expected: Pods install successfully, ReactNativeArView pod includes GLTFKit2

**Step 3: Build the iOS project**

```bash
cd example/ios && xcodebuild -workspace reactnativearviewexample.xcworkspace -scheme reactnativearviewexample -destination 'generic/platform=iOS' -configuration Debug build 2>&1 | tail -20
```

Expected: BUILD SUCCEEDED

**Step 4: Fix any compilation errors**

If there are build errors, fix them iteratively. Common issues:
- GLTFKit2 import paths
- ExpoModulesCore API differences between versions
- SCNScene(gltfAsset:) method name may differ — check GLTFKit2's SceneKit extension
- EventDispatcher call syntax may need adjustment

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(ios): resolve compilation errors"
```

---

### Task 9: Manual device testing

**Step 1: Run on physical iOS device**

```bash
cd example && npx expo run:ios --device
```

Note: AR requires a physical device with ARKit support (iPhone 6s or later, iOS 15.1+). The simulator does NOT support ARKit.

**Step 2: Test checklist**

- [ ] App launches without crash
- [ ] Camera feed appears in the AR view
- [ ] Plane detection events fire (check console logs)
- [ ] Tracking state changes from "unavailable" → "limited" → "normal"
- [ ] Translucent plane overlays appear on detected surfaces
- [ ] Tapping on a plane loads and places the DamagedHelmet model
- [ ] Plane overlays disappear after model placement
- [ ] Pinch-to-scale works with dampening
- [ ] Rotation gesture works (rotate around Y axis)
- [ ] Push to SecondScene works (Duck model loads)
- [ ] Pop back to MainScene restores DamagedHelmet
- [ ] Scale range limits are respected

**Step 3: Fix any runtime issues and commit**

```bash
git add -A
git commit -m "fix(ios): resolve runtime issues from device testing"
```

---

### Task 10: Final commit

**Step 1: Verify all files are committed**

```bash
git status
git log --oneline -10
```

**Step 2: Create summary commit if needed**

If there are uncommitted changes:
```bash
git add -A
git commit -m "feat(ios): complete ARKit implementation with full Android parity"
```

---

## Summary of Changes

| File | Action | Purpose |
|------|--------|---------|
| `ios/setup-frameworks.sh` | Create | Downloads GLTFKit2 xcframework |
| `ios/ReactNativeArView.podspec` | Modify | Add ARKit, SceneKit, GLTFKit2 deps |
| `ios/ModelConfig.swift` | Create | Model configuration data model |
| `ios/ARSceneState.swift` | Create | Scene state for stack management |
| `ios/ReactNativeArView.swift` | Replace | Full ARSCNView implementation |
| `ios/ReactNativeArViewModule.swift` | Replace | Expo module with events + functions |
| `example/ios/.../Info.plist` | Modify | Camera permission + ARKit capability |
| `example/app.json` | Modify | iOS AR permissions |
| `.gitignore` | Modify | Ignore vendored frameworks |

## No JS Changes Required

The TypeScript bridge layer (`src/`) is already platform-agnostic. The same events, module functions, and component API work for both iOS and Android.
