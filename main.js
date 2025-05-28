import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.module.js';

async function loadPitchData() {
  const res = await fetch('./pitch_data.json');
  return await res.json();
}

let scene, camera, renderer;
let balls = [];
let pitchData = {};
let activeTypes = new Set();
let playing = true;

const clock = new THREE.Clock();

const pitchColors = {
  FF: '#FF0000',
  FT: '#8B0000',
  SI: '#FFA500',
  FC: '#808080',
  SL: '#0000FF',
  ST: '#008080',
  CU: '#800080',
  KC: '#4B0082',
  CH: '#008000',
  FS: '#4682B4',
  FO: '#B22222',
  CS: '#9370DB',
  KN: '#FFFF00',
  EP: '#A0522D',
  SV: '#20B2AA'
};

init();

async function init() {
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2.5, -65);
  camera.lookAt(0, 2.5, 0);
  scene.add(camera);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(-10, 15, -25);
  dirLight.castShadow = true;
  scene.add(dirLight);
  const plateLight = new THREE.PointLight(0xffffff, 0.6, 100);
  plateLight.position.set(0, 3, -60.5);
  scene.add(plateLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x1e472d, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const zone = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.42, 2.0)),
    new THREE.LineBasicMaterial({ color: 0x00ffff })
  );
  zone.position.set(0, 2.5, -60.5);
  scene.add(zone);

  const shape = new THREE.Shape();
  shape.moveTo(-0.85, 0);
  shape.lineTo(0.85, 0);
  shape.lineTo(0.85, 0.5);
  shape.lineTo(0, 1.0);
  shape.lineTo(-0.85, 0.5);
  shape.lineTo(-0.85, 0);
  const plate = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.rotation.z = 0;
  plate.position.set(0, 0.011, -60.5);
  scene.add(plate);

  pitchData = await loadPitchData();
  const checkboxContainer = document.getElementById('pitchCheckboxes');
  Object.keys(pitchData).forEach((pitchType) => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = pitchType;
    checkbox.checked = false;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        activeTypes.add(pitchType);
        addBall(pitchData[pitchType], pitchType);
      } else {
        activeTypes.delete(pitchType);
        removeBall(pitchType);
      }
    });

    const label = document.createElement('label');
    label.htmlFor = pitchType;
    label.textContent = pitchType;

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(label);
  });

  document.getElementById('toggleBtn').addEventListener('click', () => {
    playing = !playing;
    document.getElementById('toggleBtn').textContent = playing ? 'Pause' : 'Play';

    if (playing) {
      clock.start();
      balls.forEach(ball => {
        ball.userData.t0 = 0;
        ball.position.set(
          ball.userData.release.x,
          ball.userData.release.y,
          ball.userData.release.z
        );
      });
    } else {
      clock.stop();
    }
  });

  animate();
}

function addBall(pitch, pitchType) {
  const ballGeo = new THREE.SphereGeometry(0.145, 32, 32);
  const posAttr = ballGeo.attributes.position;
  const colors = [];

  const white = new THREE.Color(1, 1, 1);
  const pitchHex = pitchColors[pitchType] || '#AAAAAA';
  const pitchColor = new THREE.Color(pitchHex);

  for (let i = 0; i < posAttr.count; i++) {
    const c = posAttr.getX(i) >= 0 ? white : pitchColor;
    colors.push(c.r, c.g, c.b);
  }

  ballGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const ball = new THREE.Mesh(
    ballGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 })
  );
  ball.castShadow = true;

  const spinRate = ((pitch.release_spin_rate ?? 0) * 2 * Math.PI) / 60;
  const spinAxis = new THREE.Vector3(
    Math.cos(THREE.MathUtils.degToRad(pitch.spin_axis ?? 0)),
    Math.sin(THREE.MathUtils.degToRad(pitch.spin_axis ?? 0)),
    0
  ).normalize();

  const initialSpinOffset = (pitchType.charCodeAt(0) * 0.25) % (2 * Math.PI);
  const baseQuat = new THREE.Quaternion().setFromAxisAngle(spinAxis, initialSpinOffset);

  ball.userData = {
    type: pitchType,
    t0: 0,
    release: {
      x: -pitch.release_pos_x,
      y: pitch.release_pos_z + 0.65,
      z: -2.03
    },
    velocity: {
      x: -pitch.vx0,
      y: pitch.vz0,
      z: pitch.vy0
    },
    accel: {
      x: -pitch.ax,
      y: pitch.az,
      z: pitch.ay
    },
    spinRate,
    spinAxis,
    baseQuat
  };

  balls.push(ball);
  scene.add(ball);
}

function removeBall(pitchType) {
  balls = balls.filter((ball) => {
    if (ball.userData.type === pitchType) {
      scene.remove(ball);
      return false;
    }
    return true;
  });
}

function animate() {
  if (playing) {
    const now = clock.getElapsedTime();

    for (const ball of balls) {
      const { t0, release, velocity, accel, spinRate, spinAxis, baseQuat } = ball.userData;
      const t = now - t0;

      const z = release.z + velocity.z * t + 0.5 * accel.z * t * t;
      if (z <= -60.5) {
        ball.userData.t0 = 0;
        continue;
      }

      ball.position.x = release.x + velocity.x * t + 0.5 * accel.x * t * t;
      ball.position.y = release.y + velocity.y * t + 0.5 * accel.y * t * t;
      ball.position.z = z;

      const spinStep = new THREE.Quaternion().setFromAxisAngle(spinAxis, spinRate * t);
      ball.quaternion.copy(baseQuat).multiply(spinStep);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
