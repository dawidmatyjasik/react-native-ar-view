import * as React from 'react';

export type ModelRegistration = {
  id: string;
  sourceUri: string;
  placement: string;
  scale: number;
  rotation: [number, number, number];
  gestureScale: boolean;
  gestureRotate: boolean;
  gestureScaleMin: number;
  gestureScaleMax: number;
};

type ARSceneContextType = {
  registerModel: (id: string, config: ModelRegistration) => void;
  unregisterModel: (id: string) => void;
};

const ARSceneContext = React.createContext<ARSceneContextType | null>(null);

export function useModelRegistration() {
  return React.useContext(ARSceneContext);
}

export function ARSceneProvider({
  onModelsChanged,
  children,
}: {
  onModelsChanged: (models: ModelRegistration[]) => void;
  children: React.ReactNode;
}) {
  const modelsRef = React.useRef<Map<string, ModelRegistration>>(new Map());

  const contextValue = React.useMemo<ARSceneContextType>(() => ({
    registerModel: (id: string, config: ModelRegistration) => {
      modelsRef.current.set(id, config);
      onModelsChanged(Array.from(modelsRef.current.values()));
    },
    unregisterModel: (id: string) => {
      modelsRef.current.delete(id);
      onModelsChanged(Array.from(modelsRef.current.values()));
    },
  }), [onModelsChanged]);

  return (
    <ARSceneContext.Provider value={contextValue}>
      {children}
    </ARSceneContext.Provider>
  );
}
