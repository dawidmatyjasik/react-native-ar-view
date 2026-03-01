import ExpoModulesCore
import ARKit
import SceneKit
import GLTFKit2

class ReactNativeArView: ExpoView, ARSCNViewDelegate, ARSessionDelegate, UIGestureRecognizerDelegate {

    // MARK: - Static instance for module access

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

    private let arSceneView = ARSCNView()

    // MARK: - Scene management

    private var sceneStack: [ARSceneState] = []
    private var currentModels: [ModelConfig] = []
    private var placedAnchors: [AnchorNodePair] = []

    // MARK: - Pending models for tap-to-place

    private var pendingModelConfigs: [ModelConfig] = []
    private var currentPendingIndex: Int = 0

    // MARK: - Node-to-config map for gesture settings

    private var nodeConfigMap: [SCNNode: ModelConfig] = [:]

    // MARK: - Currently selected node for gestures

    private var activeGestureNode: SCNNode?

    // MARK: - Tracking state

    private var lastTrackingState: String = "unavailable"
    private var detectedPlaneIds: Set<String> = []

    // MARK: - Layout flag

    private var hasStartedSession = false

    // MARK: - Plane overlay nodes

    private var planeOverlayNodes: [ARAnchor: SCNNode] = [:]
    private var hasPlacedFirstModel = false

    // MARK: - Init

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true

        ReactNativeArView.currentInstance = self

        // Configure ARSCNView
        arSceneView.delegate = self
        arSceneView.session.delegate = self
        arSceneView.autoenablesDefaultLighting = true
        arSceneView.automaticallyUpdatesLighting = true
        arSceneView.translatesAutoresizingMaskIntoConstraints = false

        addSubview(arSceneView)

        // Set up gesture recognizers
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        arSceneView.addGestureRecognizer(tapGesture)

        let pinchGesture = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        pinchGesture.delegate = self
        arSceneView.addGestureRecognizer(pinchGesture)

        let rotationGesture = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:)))
        rotationGesture.delegate = self
        arSceneView.addGestureRecognizer(rotationGesture)

        let panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        panGesture.delegate = self
        arSceneView.addGestureRecognizer(panGesture)
    }

    // Allow simultaneous gesture recognition (pinch + rotation)
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        return true
    }

    // MARK: - Layout & Lifecycle

    override func layoutSubviews() {
        super.layoutSubviews()
        arSceneView.frame = bounds

        if !hasStartedSession && bounds.width > 0 && bounds.height > 0 {
            hasStartedSession = true
            startARSession()
        }
    }

    private func startARSession() {
        guard ARWorldTrackingConfiguration.isSupported else {
            onARError([
                "code": "AR_NOT_SUPPORTED",
                "message": "ARWorldTrackingConfiguration is not supported on this device"
            ])
            return
        }

        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal, .vertical]
        configuration.environmentTexturing = .automatic

        // Enable scene depth if LiDAR is available
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
        }

        arSceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    override func removeFromSuperview() {
        arSceneView.session.pause()
        if ReactNativeArView.currentInstance === self {
            ReactNativeArView.currentInstance = nil
        }
        super.removeFromSuperview()
    }

    // MARK: - ARSCNViewDelegate (Plane Visualization)

    func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
        guard let planeAnchor = anchor as? ARPlaneAnchor else { return }

        // Create translucent plane overlay
        let plane = SCNPlane(
            width: CGFloat(planeAnchor.extent.x),
            height: CGFloat(planeAnchor.extent.z)
        )
        let material = SCNMaterial()
        material.diffuse.contents = UIColor(white: 1.0, alpha: 0.3)
        material.isDoubleSided = true
        plane.materials = [material]

        let planeNode = SCNNode(geometry: plane)
        // SCNPlane is vertical by default, rotate to be horizontal
        planeNode.eulerAngles.x = -.pi / 2
        planeNode.isHidden = hasPlacedFirstModel

        node.addChildNode(planeNode)
        planeOverlayNodes[anchor] = planeNode

        // Fire plane detected event (dedup by plane ID)
        let planeId = anchor.identifier.uuidString
        if !detectedPlaneIds.contains(planeId) {
            detectedPlaneIds.insert(planeId)
            let type: String = planeAnchor.alignment == .vertical ? "vertical" : "horizontal"
            DispatchQueue.main.async { [weak self] in
                self?.onPlaneDetected(["id": planeId, "type": type])
            }
        }
    }

    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let planeAnchor = anchor as? ARPlaneAnchor,
              let planeNode = planeOverlayNodes[anchor],
              let plane = planeNode.geometry as? SCNPlane else { return }

        // Update plane extent
        plane.width = CGFloat(planeAnchor.extent.x)
        plane.height = CGFloat(planeAnchor.extent.z)
    }

    func renderer(_ renderer: SCNSceneRenderer, didRemove node: SCNNode, for anchor: ARAnchor) {
        guard let planeAnchor = anchor as? ARPlaneAnchor else { return }
        planeOverlayNodes.removeValue(forKey: planeAnchor as ARAnchor)
    }

    private func hidePlaneOverlays() {
        for (_, planeNode) in planeOverlayNodes {
            planeNode.isHidden = true
        }
    }

    private func showPlaneOverlays() {
        hasPlacedFirstModel = false
        for (_, planeNode) in planeOverlayNodes {
            planeNode.isHidden = false
        }
    }

    // MARK: - ARSessionDelegate (Tracking State)

    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let newState: String
        switch camera.trackingState {
        case .normal:
            newState = "normal"
        case .limited(let reason):
            newState = "limited"
            let reasonStr: String
            switch reason {
            case .excessiveMotion:
                reasonStr = "excessive_motion"
            case .insufficientFeatures:
                reasonStr = "insufficient_features"
            case .initializing:
                reasonStr = "initializing"
            case .relocalizing:
                reasonStr = "relocalizing"
            @unknown default:
                reasonStr = "unknown"
            }
            lastTrackingState = newState
            onTrackingStateChange(["state": newState, "reason": reasonStr])
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

    // MARK: - Tap-to-Place

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let location = gesture.location(in: arSceneView)

        // First: hit test existing model nodes (for selecting active gesture node)
        let hitResults = arSceneView.hitTest(location, options: [
            SCNHitTestOption.searchMode: SCNHitTestSearchMode.all.rawValue
        ])

        for result in hitResults {
            let tappedNode = findModelRootNode(result.node)
            if let tappedNode = tappedNode, nodeConfigMap[tappedNode] != nil {
                activeGestureNode = tappedNode
                return
            }
        }

        // Second: no existing node tapped, try placing a pending model
        activeGestureNode = nil

        guard !pendingModelConfigs.isEmpty, currentPendingIndex < pendingModelConfigs.count else {
            return
        }

        // Raycast for plane placement
        guard let query = arSceneView.raycastQuery(
            from: location,
            allowing: .existingPlaneGeometry,
            alignment: .any
        ) else { return }

        let results = arSceneView.session.raycast(query)
        guard let firstResult = results.first else { return }

        // Create anchor at hit location
        let anchor = ARAnchor(transform: firstResult.worldTransform)
        arSceneView.session.add(anchor: anchor)

        let config = pendingModelConfigs[currentPendingIndex]
        currentPendingIndex += 1

        loadAndPlaceModel(anchor: anchor, config: config)
    }

    /// Walk up the node hierarchy to find the root model container node that's in nodeConfigMap
    private func findModelRootNode(_ node: SCNNode) -> SCNNode? {
        var current: SCNNode? = node
        while let n = current {
            if nodeConfigMap[n] != nil {
                return n
            }
            current = n.parent
        }
        return nil
    }

    // MARK: - Model Loading

    private func loadAndPlaceModel(anchor: ARAnchor, config: ModelConfig) {
        let modelId = config.id.isEmpty ? "\(config.sourceUri.hashValue)" : config.id

        Task {
            do {
                let localURL = try await resolveModelURL(config.sourceUri)
                let gltfAsset = try await loadGLTFAsset(from: localURL)
                let scene = try SCNScene(gltfAsset: gltfAsset)

                await MainActor.run {
                    // Create container node for the model
                    let containerNode = SCNNode()

                    // Clone all children from the GLTF scene root into our container
                    for child in scene.rootNode.childNodes {
                        containerNode.addChildNode(child.clone())
                    }

                    // Apply scale
                    let s = config.scale
                    containerNode.scale = SCNVector3(s, s, s)

                    // Apply rotation (euler angles in radians)
                    if config.rotation.count >= 3 {
                        containerNode.eulerAngles = SCNVector3(
                            config.rotation[0],
                            config.rotation[1],
                            config.rotation[2]
                        )
                    }

                    // Find the anchor node in the scene and attach the model
                    if let anchorNode = self.arSceneView.node(for: anchor) {
                        anchorNode.addChildNode(containerNode)
                    }

                    // Track placement
                    self.nodeConfigMap[containerNode] = config
                    self.placedAnchors.append(AnchorNodePair(anchor: anchor, node: containerNode))
                    self.activeGestureNode = containerNode

                    // Hide plane overlays after first placement
                    if !self.hasPlacedFirstModel {
                        self.hasPlacedFirstModel = true
                        self.hidePlaneOverlays()
                    }

                    self.onModelLoaded(["modelId": modelId])
                    self.onModelPlaced([
                        "modelId": modelId,
                        "anchorId": anchor.identifier.uuidString
                    ])
                }
            } catch {
                await MainActor.run {
                    self.onModelError([
                        "modelId": modelId,
                        "code": "MODEL_LOAD_FAILED",
                        "message": error.localizedDescription
                    ])
                }
            }
        }
    }

    /// Resolve a model URI to a local file URL.
    /// Supports "asset://..." (bundled assets) and "https://..." (remote download).
    private func resolveModelURL(_ uri: String) async throws -> URL {
        if uri.hasPrefix("asset://") {
            // Strip the "asset://" prefix
            let assetName = String(uri.dropFirst("asset://".count))
            // Try to find in the main bundle
            if let url = Bundle.main.url(forResource: assetName, withExtension: nil) {
                return url
            }
            // Try without extension
            let name = (assetName as NSString).deletingPathExtension
            let ext = (assetName as NSString).pathExtension
            if let url = Bundle.main.url(forResource: name, withExtension: ext.isEmpty ? nil : ext) {
                return url
            }
            throw ARViewError.assetNotFound(assetName)
        } else if uri.hasPrefix("http://") || uri.hasPrefix("https://") {
            guard let remoteURL = URL(string: uri) else {
                throw ARViewError.invalidURL(uri)
            }
            return try await downloadFile(from: remoteURL)
        } else {
            // Assume it's a local file path
            let url = URL(fileURLWithPath: uri)
            if FileManager.default.fileExists(atPath: url.path) {
                return url
            }
            throw ARViewError.assetNotFound(uri)
        }
    }

    /// Download a remote file to a temporary location
    private func downloadFile(from remoteURL: URL) async throws -> URL {
        let (tempURL, response) = try await URLSession.shared.download(from: remoteURL)

        let httpResponse = response as? HTTPURLResponse
        guard let statusCode = httpResponse?.statusCode,
              (200...299).contains(statusCode) else {
            let code = httpResponse?.statusCode ?? 0
            throw ARViewError.downloadFailed("\(remoteURL.absoluteString) (HTTP \(code))")
        }

        // Move to a temp location with the original file extension
        let ext = remoteURL.pathExtension
        let destURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(ext)

        try FileManager.default.moveItem(at: tempURL, to: destURL)
        return destURL
    }

    /// Load a GLTFAsset from a local file URL using GLTFKit2
    private func loadGLTFAsset(from url: URL) async throws -> GLTFAsset {
        return try await withCheckedThrowingContinuation { continuation in
            var hasResumed = false
            GLTFAsset.load(with: url, options: [:]) { (_, status, asset, error, _) in
                guard !hasResumed else { return }
                switch status {
                case .complete:
                    hasResumed = true
                    if let asset = asset {
                        continuation.resume(returning: asset)
                    } else {
                        continuation.resume(throwing: error ?? ARViewError.modelLoadFailed("Unknown error"))
                    }
                case .error:
                    hasResumed = true
                    continuation.resume(throwing: error ?? ARViewError.modelLoadFailed("GLTF load error"))
                default:
                    break
                }
            }
        }
    }

    // MARK: - Gesture: Pinch to Scale

    @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
        guard let node = activeGestureNode,
              let config = nodeConfigMap[node],
              config.gestureScale else { return }

        if gesture.state == .changed {
            let rawFactor = Float(gesture.scale)
            let sensitivity = config.gestureScaleSensitivity
            let dampenedFactor = 1.0 + (rawFactor - 1.0) * sensitivity

            let currentScale = node.scale.x
            var newScale = currentScale * dampenedFactor
            newScale = min(max(newScale, config.gestureScaleMin), config.gestureScaleMax)

            node.scale = SCNVector3(newScale, newScale, newScale)

            // Reset for incremental updates
            gesture.scale = 1.0
        }
    }

    // MARK: - Gesture: Rotation

    @objc private func handleRotation(_ gesture: UIRotationGestureRecognizer) {
        guard let node = activeGestureNode,
              let config = nodeConfigMap[node],
              config.gestureRotate else { return }

        if gesture.state == .changed {
            node.eulerAngles.y -= Float(gesture.rotation)
            gesture.rotation = 0
        }
    }

    // MARK: - Gesture: Pan to Drag

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let node = activeGestureNode,
              nodeConfigMap[node] != nil else { return }

        let location = gesture.location(in: arSceneView)

        guard let query = arSceneView.raycastQuery(
            from: location,
            allowing: .existingPlaneGeometry,
            alignment: .any
        ) else { return }

        let results = arSceneView.session.raycast(query)
        guard let result = results.first else { return }

        switch gesture.state {
        case .changed, .began:
            // Get the hit world position
            let hitWorldPosition = SCNVector3(
                result.worldTransform.columns.3.x,
                result.worldTransform.columns.3.y,
                result.worldTransform.columns.3.z
            )

            // Convert world position to local position relative to the anchor (parent) node
            if let parentNode = node.parent {
                let localPos = parentNode.convertPosition(hitWorldPosition, from: nil)
                node.position = localPos
            }
        default:
            break
        }
    }

    // MARK: - Scene Stack Management

    func setModels(_ models: [ModelConfig]) {
        pendingModelConfigs = models
        currentPendingIndex = 0
        currentModels = models

        // Re-enable plane visualization so user can see surfaces to tap
        if !models.isEmpty {
            showPlaneOverlays()
        }
    }

    func pushScene(_ models: [ModelConfig]) {
        // Save current state
        let state = ARSceneState(
            models: currentModels,
            anchorNodes: placedAnchors
        )
        sceneStack.append(state)

        // Hide current anchor nodes
        for pair in placedAnchors {
            pair.node.isHidden = true
        }

        placedAnchors = []
        setModels(models)

        onSceneChange(["action": "push", "depth": sceneStack.count])
    }

    func popScene() -> Bool {
        guard !sceneStack.isEmpty else { return false }

        // Destroy current anchor nodes
        for pair in placedAnchors {
            cleanupAnchorNodeConfigs(pair)
            arSceneView.session.remove(anchor: pair.anchor)
            pair.node.removeFromParentNode()
        }
        placedAnchors = []

        // Restore previous state
        let previous = sceneStack.removeLast()
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
        // Destroy current anchor nodes
        for pair in placedAnchors {
            cleanupAnchorNodeConfigs(pair)
            arSceneView.session.remove(anchor: pair.anchor)
            pair.node.removeFromParentNode()
        }
        placedAnchors = []

        setModels(models)
        onSceneChange(["action": "replace", "depth": sceneStack.count])
    }

    func popToTop() {
        guard !sceneStack.isEmpty else { return }

        // Destroy current anchor nodes
        for pair in placedAnchors {
            cleanupAnchorNodeConfigs(pair)
            arSceneView.session.remove(anchor: pair.anchor)
            pair.node.removeFromParentNode()
        }
        placedAnchors = []

        // Destroy all intermediate states
        while sceneStack.count > 1 {
            let state = sceneStack.removeLast()
            for pair in state.anchorNodes {
                cleanupAnchorNodeConfigs(pair)
                arSceneView.session.remove(anchor: pair.anchor)
                pair.node.removeFromParentNode()
            }
        }

        // Restore the first (bottom) state
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

    /// Remove nodeConfigMap entries for a given anchor-node pair
    private func cleanupAnchorNodeConfigs(_ pair: AnchorNodePair) {
        nodeConfigMap.removeValue(forKey: pair.node)
        for child in pair.node.childNodes {
            nodeConfigMap.removeValue(forKey: child)
        }
    }
}

// MARK: - Error Types

enum ARViewError: LocalizedError {
    case assetNotFound(String)
    case invalidURL(String)
    case downloadFailed(String)
    case modelLoadFailed(String)

    var errorDescription: String? {
        switch self {
        case .assetNotFound(let name):
            return "Asset not found: \(name)"
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .downloadFailed(let url):
            return "Failed to download: \(url)"
        case .modelLoadFailed(let reason):
            return "Failed to load model: \(reason)"
        }
    }
}
