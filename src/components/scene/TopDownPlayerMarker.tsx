import { topDownPlayerMaterial } from '../../config/constants'

export function TopDownPlayerMarker() {
  return (
    <group position={[0, 0.08, 0]} userData={{ excludeCameraCollision: true }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 24]} />
        <primitive object={topDownPlayerMaterial} attach="material" />
      </mesh>
    </group>
  )
}
