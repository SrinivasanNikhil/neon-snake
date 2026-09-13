/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Grid, Sphere } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { gameInput, useKeyboardControls } from '../client/input';
import { GAME_CONFIG } from '../shared/gameConfig';
import { WORLD_SIZE, type Hazard, type PlayerState } from '../shared/types';
import { globalGameState, useGameStore } from '../store/gameStore';

function Snake({
  playerId,
  color,
  state,
}: {
  playerId: string;
  color: string;
  state: PlayerState;
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const currentPositions = useRef<Array<{ x: number; y: number }>>([]);

  useFrame((_, delta) => {
    if (!bodyRef.current || !headRef.current) return;
    const player = globalGameState.current?.players[playerId];
    if (!player || player.segments.length === 0) {
      bodyRef.current.count = 0;
      headRef.current.visible = false;
      return;
    }

    headRef.current.visible = true;
    const count = Math.min(player.segments.length, GAME_CONFIG.maximumLength);
    bodyRef.current.count = Math.max(0, count - 1);
    currentPositions.current.length = Math.min(currentPositions.current.length, count);

    while (currentPositions.current.length < count) {
      const segment = player.segments[currentPositions.current.length] ?? player.segments[0];
      currentPositions.current.push({ ...segment });
    }

    for (let index = 0; index < count; index += 1) {
      const target = player.segments[index];
      const current = currentPositions.current[index];
      const distance = Math.abs(target.x - current.x) + Math.abs(target.y - current.y);
      if (distance > 10) {
        current.x = target.x;
        current.y = target.y;
      } else {
        const interpolation = Math.min(1, 15 * delta);
        current.x += (target.x - current.x) * interpolation;
        current.y += (target.y - current.y) * interpolation;
      }

      if (index === 0) {
        headRef.current.position.set(current.x, current.y, 0.5);
      } else {
        dummy.position.set(current.x, current.y, 0.5);
        dummy.updateMatrix();
        bodyRef.current.setMatrixAt(index - 1, dummy.matrix);
      }
    }
    bodyRef.current.instanceMatrix.needsUpdate = true;
  });

  const isProtected = state === 'quiz';
  return (
    <group>
      <Sphere ref={headRef} castShadow receiveShadow args={[0.8, 16, 16]}>
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.8}
          toneMapped={false}
          transparent={isProtected}
          opacity={isProtected ? 0.35 : 1}
        />
      </Sphere>
      <instancedMesh
        ref={bodyRef}
        args={[null as never, null as never, GAME_CONFIG.maximumLength - 1]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.8}
          toneMapped={false}
          transparent={isProtected}
          opacity={isProtected ? 0.25 : 1}
        />
      </instancedMesh>
    </group>
  );
}

function Orbs() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (!meshRef.current) return;
    const orbs = Object.values(globalGameState.current?.orbs ?? {});
    const count = Math.min(orbs.length, 300);
    for (let index = 0; index < count; index += 1) {
      const orb = orbs[index];
      dummy.position.set(orb.x, orb.y, 0.5);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(index, dummy.matrix);
      color.set(orb.color);
      meshRef.current.setColorAt(index, color);
    }
    meshRef.current.count = count;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[null as never, null as never, 300]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshStandardMaterial roughness={0.4} metalness={0.1} toneMapped={false} />
    </instancedMesh>
  );
}

function HazardMarker({ hazard, phase }: { hazard: Hazard; phase: number }) {
  const pulseRef = useRef<THREE.Group>(null);
  const warningRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime + phase;
    if (pulseRef.current) {
      const pulse = 1 + Math.sin(elapsed * 4) * 0.1;
      pulseRef.current.scale.setScalar(pulse);
    }
    if (warningRef.current) {
      warningRef.current.rotation.z = elapsed * 1.5;
      warningRef.current.position.z = 1.15 + Math.sin(elapsed * 3) * 0.12;
    }
  });

  return (
    <group position={[hazard.x, hazard.y, 0]}>
      <group ref={pulseRef}>
        <mesh position={[0, 0, 0.015]}>
          <ringGeometry args={[hazard.radius * 0.82, hazard.radius * 1.16, 32]} />
          <meshBasicMaterial
            color="#ff3b0a"
            transparent
            opacity={0.42}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <torusGeometry args={[hazard.radius, Math.max(0.12, hazard.radius * 0.11), 8, 32]} />
          <meshBasicMaterial color="#ffb000" toneMapped={false} />
        </mesh>
      </group>

      {/* A rotating triangular pylon makes hazards recognizable without relying on color. */}
      <mesh ref={warningRef} rotation={[Math.PI / 2, 0, phase]} castShadow>
        <coneGeometry args={[hazard.radius * 0.5, hazard.radius * 0.75, 3]} />
        <meshStandardMaterial
          color="#ff5a1f"
          emissive="#ff2200"
          emissiveIntensity={2.2}
          roughness={0.25}
          metalness={0.45}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[hazard.radius * 0.32, hazard.radius * 0.5, 0.3, 6]} />
        <meshStandardMaterial
          color="#1a0500"
          emissive="#ff4d00"
          emissiveIntensity={1.2}
          roughness={0.45}
          toneMapped={false}
        />
      </mesh>
      {/* Lightweight 3D exclamation glyph remains legible without color or textures. */}
      <group position={[0, 0, hazard.radius * 0.8]}>
        <mesh position={[0, hazard.radius * 0.15, 0]}>
          <boxGeometry args={[hazard.radius * 0.13, hazard.radius * 0.34, 0.12]} />
          <meshBasicMaterial color="#fff7d6" toneMapped={false} />
        </mesh>
        <mesh position={[0, -hazard.radius * 0.1, 0]}>
          <sphereGeometry args={[hazard.radius * 0.08, 10, 10]} />
          <meshBasicMaterial color="#fff7d6" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Hazards({ hazards }: { hazards: Record<string, Hazard> }) {
  return (
    <group>
      {Object.values(hazards).map((hazard, index) => (
        <HazardMarker key={hazard.id} hazard={hazard} phase={index * 0.7} />
      ))}
    </group>
  );
}

export function GameScene() {
  const gameState = useGameStore((state) => state.gameState);
  const playerId = useGameStore((state) => state.playerId);
  const sendInput = useGameStore((state) => state.sendInput);
  const { camera } = useThree();
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const [lightTarget] = useState(() => new THREE.Object3D());

  const renderedPlayer = playerId && gameState ? gameState.players[playerId] : undefined;
  useKeyboardControls({ enabled: renderedPlayer?.state === 'alive', controller: gameInput });

  useEffect(() => {
    if (renderedPlayer?.state !== 'alive') return undefined;

    // The server holds the most recently received control state, so unchanged
    // input does not need a 30 Hz network heartbeat. Sending only transitions
    // keeps classroom usage comfortably inside Cloudflare's request allowance.
    sendInput(gameInput.getSnapshot());
    return gameInput.subscribe(sendInput);
  }, [renderedPlayer?.runId, renderedPlayer?.state, sendInput]);

  useFrame((_, delta) => {
    const player = playerId ? globalGameState.current?.players[playerId] : undefined;
    if (!player) return;

    const head = player.segments[0];
    if (!head) return;
    const targetZ = Math.min(45, Math.max(20, 20 + player.segments.length * 0.2));
    camera.position.x += (head.x - camera.position.x) * Math.min(1, 10 * delta);
    camera.position.y += (head.y - camera.position.y) * Math.min(1, 10 * delta);
    camera.position.z += (targetZ - camera.position.z) * Math.min(1, 4 * delta);
    camera.lookAt(camera.position.x, camera.position.y, 0);

    if (lightRef.current) {
      lightRef.current.position.set(camera.position.x + 10, camera.position.y - 10, 30);
      lightTarget.position.set(camera.position.x, camera.position.y, 0);
    }
  });

  if (!gameState) return null;

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        ref={lightRef}
        target={lightTarget}
        castShadow
        intensity={2}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={0.1}
        shadow-camera-far={100}
        shadow-bias={-0.001}
      />
      <primitive object={lightTarget} />

      <mesh receiveShadow position={[0, 0, -0.2]}>
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>
      <Grid
        position={[0, 0, -0.1]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[WORLD_SIZE, WORLD_SIZE]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1e3a8a"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#3b82f6"
        fadeDistance={100}
        fadeStrength={1}
      />
      <Orbs />
      {gameState.hazardsActive && <Hazards hazards={gameState.hazards} />}
      {Object.values(gameState.players).map((player) =>
        (player.state === 'alive' || player.state === 'quiz') &&
        player.segments.length > 0 ? (
          <Snake
            key={player.id}
            playerId={player.id}
            color={player.color}
            state={player.state}
          />
        ) : null,
      )}
    </>
  );
}
