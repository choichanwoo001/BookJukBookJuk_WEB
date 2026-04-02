import { useMemo } from 'react'
import { GridHelper, LineBasicMaterial, MeshStandardMaterial } from 'three'
import { Text } from '@react-three/drei'

const GRID_SIZE = 70
const GRID_DIVISIONS = 14 // 5m per cell
const GRID_Y = 0.01

const gridMaterial = new LineBasicMaterial({
  color: '#FFFFFF',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
})

const originMaterial = new MeshStandardMaterial({
  color: '#FF4444',
  roughness: 0.5,
  metalness: 0.0,
})

const X_LABELS = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30]
const Z_LABELS = [-15, -10, -5, 0, 5, 10, 15]

export function CoordinateGrid() {
  const grid = useMemo(() => {
    const helper = new GridHelper(GRID_SIZE, GRID_DIVISIONS, '#AAAAAA', '#FFFFFF')
    helper.material = gridMaterial
    return helper
  }, [])

  return (
    <group>
      {/* 격자 라인 */}
      <primitive object={grid} position={[0, GRID_Y, 0]} />

      {/* X축 라벨 (Z=-19 위치에 X 좌표 표시) */}
      {X_LABELS.map((x) => (
        <Text
          key={`x-${x}`}
          position={[x, 0.05, -19]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.8}
          color={x === 0 ? '#FFD700' : '#FFFFFF'}
          anchorX="center"
          anchorY="middle"
          renderOrder={1}
          depthOffset={-1}
        >
          {`X:${x}`}
        </Text>
      ))}

      {/* Z축 라벨 (X=-34 위치에 Z 좌표 표시) */}
      {Z_LABELS.map((z) => (
        <Text
          key={`z-${z}`}
          position={[-34, 0.05, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.8}
          color={z === 0 ? '#FFD700' : '#FFFFFF'}
          anchorX="center"
          anchorY="middle"
          renderOrder={1}
          depthOffset={-1}
        >
          {`Z:${z}`}
        </Text>
      ))}

      {/* 원점(0,0) 표시 */}
      <mesh position={[0, 0.02, 0]} material={originMaterial}>
        <cylinderGeometry args={[0.3, 0.3, 0.02, 24]} />
      </mesh>
    </group>
  )
}
