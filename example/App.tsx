import {
  ARNavigator,
  ARModel,
  useARNavigator,
  useSceneProps,
} from "react-native-ar-view";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type SecondSceneProps = { modelScale: number; hint: string };

function MainScene() {
  const navigator = useARNavigator();

  return (
    <>
      <ARModel
        source={{
          uri: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
        }}
        placement="tap"
        scale={0.5}
        gestures={{
          scale: true,
          rotate: true,
          scaleRange: [0.2, 2.0],
        }}
      />

      <View style={styles.overlay}>
        <Text style={styles.hint}>Tap a surface to place the model</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            navigator.push<SecondSceneProps>({
              scene: SecondScene,
              passProps: {
                modelScale: 0.3,
                hint: "Scene 2 - Tap to place a duck",
              },
            })
          }
        >
          <Text style={styles.buttonText}>Push Scene 2</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function SecondScene() {
  const navigator = useARNavigator();
  const { modelScale, hint } = useSceneProps<SecondSceneProps>() ?? {};

  return (
    <>
      <ARModel
        source={{
          uri: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb",
        }}
        placement="tap"
        scale={modelScale}
        gestures={{ scale: true, rotate: true }}
      />

      <View style={styles.overlay}>
        <Text style={styles.hint}>{hint}</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigator.pop()}>
          <Text style={styles.buttonText}>Pop back</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function App() {
  return (
    <ARNavigator
      initialScene={{ scene: MainScene }}
      style={styles.container}
      onTrackingStateChange={(state) => console.log("Tracking:", state)}
      onPlaneDetected={(plane) => console.log("Plane:", plane.type)}
      onError={(err) => Alert.alert("AR Error", `${err.code}: ${err.message}`)}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hint: {
    color: "white",
    fontSize: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
