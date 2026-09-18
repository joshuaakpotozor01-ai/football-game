import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

const gameRoot = document.getElementById('game-root');
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const menuScreen = document.getElementById('menu-screen');
const hud = document.getElementById('hud');
const controls = document.getElementById('controls');
const messageEl = document.getElementById('message');
const homeTeamSelect = document.getElementById('homeTeam');
const awayTeamSelect = document.getElementById('awayTeam');
const startBtn = document.getElementById('start-btn');
const shotBtn = document.getElementById('shotBtn');
const passBtn = document.getElementById('passBtn');
const resetBtn = document.getElementById('resetBtn');
const homeScoreEl = document.getElementById('homeScore');
const awayScoreEl = document.getElementById('awayScore');
const timerEl = document.getElementById('timer');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8dcafc);
scene.fog = new THREE.Fog(0x8dcafc, 25, 130);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 21, 34);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
gameRoot.appendChild(renderer.domElement);

const world = new CANNON.World();
world.gravity.set(0, -18, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.58;

const pitchLength = 54;
const pitchWidth = 32;
const goalWidth = 8;
const pitchY = 0;

const audio = {
  ctx: null,
  master: null,
  crowdGain: null,
  musicGain: null,
  musicStarted: false,
  crowdOscs: [],
  musicOscs: [],

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.04;
    this.crowdGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.035;
    this.musicGain.connect(this.master);

    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 130 + i * 18;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.008;
      osc.connect(gain);
      gain.connect(this.crowdGain);
      osc.start();
      this.crowdOscs.push({ osc, gain });
    }

    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 180 + i * 40;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.006;
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start();
      this.musicOscs.push({ osc, gain });
    }
  },

  start() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.musicStarted = true;
  },

  tone(freq, duration, type = 'sine', volume = 0.08, startAt = 0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startAt);
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime + startAt);
    gain.gain.exponentialRampToValueAtTime(volume, this.ctx.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + startAt + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(this.ctx.currentTime + startAt);
    osc.stop(this.ctx.currentTime + startAt + duration + 0.08);
  },

  whistle() {
    this.tone(900, 0.22, 'square', 0.1);
    this.tone(1400, 0.15, 'square', 0.08, 0.07);
  },

  kick() {
    this.tone(160, 0.12, 'triangle', 0.09);
  },

  pass() {
    this.tone(220, 0.1, 'triangle', 0.07);
    this.tone(310, 0.08, 'triangle', 0.05, 0.05);
  },

  goal() {
    this.tone(240, 0.18, 'sine', 0.12);
    this.tone(360, 0.2, 'sine', 0.1, 0.12);
    this.tone(540, 0.2, 'sine', 0.08, 0.24);
  },

  updateMusic(time) {
    if (!this.musicStarted || !this.ctx) return;
    const t = time * 0.001;
    for (const item of this.musicOscs) {
      const f = 180 + (Math.sin(t * 0.7 + item.osc.frequency.value * 0.01) * 25);
      item.osc.frequency.value = f;
    }
    for (const item of this.crowdOscs) {
      item.osc.frequency.value = 120 + item.osc.frequency.value * 0.02 + Math.sin(t + item.osc.frequency.value * 0.04) * 12;
    }
  }
};

const hemi = new THREE.HemisphereLight(0xffffff, 0x4f6d52, 1.2);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(18, 42, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
scene.add(sun);

const stadium = new THREE.Group();
scene.add(stadium);

const pitch = new THREE.Mesh(
  new THREE.PlaneGeometry(pitchLength + 18, pitchWidth + 18),
  new THREE.MeshStandardMaterial({ color: 0x4fcd73, roughness: 0.95, metalness: 0.08 })
);
pitch.rotation.x = -Math.PI / 2;
pitch.position.y = pitchY;
pitch.receiveShadow = true;
stadium.add(pitch);

const floorBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

const crowdMat = new THREE.MeshStandardMaterial({ color: 0x4d6675, roughness: 0.9 });
for (let row = 0; row < 20; row++) {
  const segment = new THREE.Mesh(new THREE.BoxGeometry(pitchLength + 14, 1.6, 1.5), crowdMat);
  segment.position.set(0, 3 + row * 0.9, -pitchWidth / 2 - 7 + (row % 2 === 0 ? 1 : -1));
  stadium.add(segment);

  const segment2 = segment.clone();
  segment2.position.z = pitchWidth / 2 + 7 - (row % 2 === 0 ? 1 : -1);
  stadium.add(segment2);
}

for (let i = 0; i < 14; i++) {
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x6fa4c8 : 0xebf1f7, roughness: 0.7 })
  );
  seat.position.set(-pitchLength / 2 + 2 + i * 4, 2.2, pitchWidth / 2 + 8);
  stadium.add(seat);
  const seat2 = seat.clone();
  seat2.position.z = -pitchWidth / 2 - 8;
  stadium.add(seat2);
}

const stadiumWalls = [
  { x: 0, y: 2.2, z: pitchWidth / 2 + 8, sx: pitchLength + 12, sy: 4.4, sz: 1.2 },
  { x: 0, y: 2.2, z: -pitchWidth / 2 - 8, sx: pitchLength + 12, sy: 4.4, sz: 1.2 },
  { x: pitchLength / 2 + 8, y: 2.2, z: 0, sx: 1.2, sy: 4.4, sz: pitchWidth + 16 },
  { x: -pitchLength / 2 - 8, y: 2.2, z: 0, sx: 1.2, sy: 4.4, sz: pitchWidth + 16 }
];

for (const wall of stadiumWalls) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.sx, wall.sy, wall.sz), new THREE.MeshStandardMaterial({ color: 0xa3bfaf, roughness: 0.9 }));
  mesh.position.set(wall.x, wall.y, wall.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stadium.add(mesh);

  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(wall.sx / 2, wall.sy / 2, wall.sz / 2)) });
  body.position.set(wall.x, wall.y, wall.z);
  world.addBody(body);
}

const linesMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, pitchWidth), linesMat);
centerLine.position.set(0, 0.04, 0);
stadium.add(centerLine);

const circle = new THREE.Mesh(new THREE.RingGeometry(5, 5.25, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
circle.rotation.x = -Math.PI / 2;
circle.position.y = 0.06;
stadium.add(circle);

const penalty1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, goalWidth), linesMat);
penalty1.position.set(-pitchLength / 2 + 6, 0.05, 0);
stadium.add(penalty1);

const penalty2 = penalty1.clone();
penalty2.position.x = pitchLength / 2 - 6;
stadium.add(penalty2);

const area1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, goalWidth + 8), linesMat);
area1.position.set(-pitchLength / 2 + 2.8, 0.05, 0);
stadium.add(area1);

const area2 = area1.clone();
area2.position.x = pitchLength / 2 - 2.8;
stadium.add(area2);

function addGoal(xPos, color) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });

  const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.8, 12), postMat);
  leftPost.position.set(xPos, 1.8, -goalWidth / 2);
  group.add(leftPost);

  const rightPost = leftPost.clone();
  rightPost.position.z = goalWidth / 2;
  group.add(rightPost);

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, goalWidth, 12), postMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(xPos, 3.4, 0);
  group.add(crossbar);

  const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
  const net = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, goalWidth), netMat);
  net.position.set(xPos + (xPos > 0 ? -0.12 : 0.12), 1.7, 0);
  group.add(net);

  stadium.add(group);
}
addGoal(-pitchLength / 2, 0x3a86ff);
addGoal(pitchLength / 2, 0xff4d4d);

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.42, 28, 28),
  new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.6, metalness: 0.15 })
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

const ballBody = new CANNON.Body({
  mass: 0.9,
  shape: new CANNON.Sphere(0.42),
  material: new CANNON.Material()
});
ballBody.position.set(0, 0.8, 0);
ballBody.linearDamping = 0.22;
ballBody.angularDamping = 0.35;
world.addBody(ballBody);

function createPlayerModel(teamColor) {
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c19a, roughness: 0.9 });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.82, metalness: 0.08 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a232d, roughness: 0.88 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.2, 6, 12), jerseyMat);
  torso.position.y = 1.7;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 20), skinMat);
  head.position.y = 2.85;
  head.castShadow = true;
  group.add(head);

  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.8, 12), darkMat);
  shorts.position.y = 0.95;
  shorts.castShadow = true;
  group.add(shorts);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.78, 4, 10), jerseyMat);
  leftArm.position.set(-0.62, 1.8, 0);
  leftArm.rotation.z = 0.85;
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.62;
  rightArm.rotation.z = -0.85;
  group.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.25, 4, 10), darkMat);
  leftLeg.position.set(-0.18, 0.1, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.18;
  group.add(rightLeg);

  const leftSock = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 10), darkMat);
  leftSock.position.set(-0.18, -0.72, 0.07);
  leftSock.castShadow = true;
  group.add(leftSock);

  const rightSock = leftSock.clone();
  rightSock.position.x = 0.18;
  group.add(rightSock);

  const feet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  feet.position.y = -1.04;
  feet.castShadow = true;
  group.add(feet);

  leftLeg.rotation.x = 0.18;
  rightLeg.rotation.x = -0.18;
  leftArm.rotation.x = -0.4;
  rightArm.rotation.x = -0.4;

  return group;
}

function createRefereeModel() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c19a, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.15, 6, 12), white);
  torso.position.y = 1.75;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 18), skin);
  head.position.y = 2.82;
  group.add(head);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 10), black);
  leftArm.position.set(-0.65, 1.75, 0);
  leftArm.rotation.z = 0.7;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.65;
  rightArm.rotation.z = -0.7;
  group.add(rightArm);

  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.72, 12), black);
  shorts.position.y = 0.96;
  group.add(shorts);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.1, 4, 10), black);
  leftLeg.position.set(-0.18, 0.05, 0);
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.18;
  group.add(rightLeg);

  const whistle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xf1c40f }));
  whistle.position.set(0, 2.2, 0.42);
  whistle.rotation.x = Math.PI / 2;
  group.add(whistle);

  group.position.set(-2, 0, -18);
  scene.add(group);
  return group;
}

const referee = createRefereeModel();

function makePlayer(team, homeX, homeZ, isUser = false) {
  const color = team === 'home' ? 0x3a86ff : 0xff4d4d;
  const mesh = createPlayerModel(color);
  mesh.position.set(homeX, 0, homeZ);
  scene.add(mesh);

  return {
    team,
    mesh,
    home: new THREE.Vector3(homeX, 0, homeZ),
    introTarget: new THREE.Vector3(homeX, 0, homeZ),
    speed: 7.5 + Math.random() * 1.6,
    isUser,
    formationIndex: 0,
    state: 'idle'
  };
}

const homeTeam = [];
const awayTeam = [];
let userPlayer = null;

function buildTeams() {
  homeTeam.length = 0;
  awayTeam.length = 0;

  const homePositions = [
    [-15, -5], [-12, 5], [-5, -8], [-5, 8], [2, 0],
    [-18, 0], [-9, -12], [-9, 12], [-2, -15], [-2, 15], [8, 0]
  ];

  const awayPositions = [
    [15, 5], [12, -5], [5, 8], [5, -8], [-2, 0],
    [18, 0], [9, 12], [9, -12], [2, 15], [2, -15], [-8, 0]
  ];

  homePositions.forEach(([x, z], idx) => {
    const p = makePlayer('home', x, z, idx === 0);
    p.formationIndex = idx;
    homeTeam.push(p);
    if (idx === 0) userPlayer = p;
  });

  awayPositions.forEach(([x, z], idx) => {
    const p = makePlayer('away', x, z, false);
    p.formationIndex = idx;
    awayTeam.push(p);
  });
}

function resetTeams() {
  const homePositions = [
    [-15, -5], [-12, 5], [-5, -8], [-5, 8], [2, 0],
    [-18, 0], [-9, -12], [-9, 12], [-2, -15], [-2, 15], [8, 0]
  ];
  const awayPositions = [
    [15, 5], [12, -5], [5, 8], [5, -8], [-2, 0],
    [18, 0], [9, 12], [9, -12], [2, 15], [2, -15], [-8, 0]
  ];

  homeTeam.forEach((p, idx) => {
    const [x, z] = homePositions[idx];
    p.mesh.position.set(x, 0, z);
    p.home.set(x, 0, z);
    p.introTarget.set(x, 0, z);
  });

  awayTeam.forEach((p, idx) => {
    const [x, z] = awayPositions[idx];
    p.mesh.position.set(x, 0, z);
    p.home.set(x, 0, z);
    p.introTarget.set(x, 0, z);
  });
}

const keyState = {};
let stickVector = { x: 0, y: 0 };
let padActive = false;

const movePad = document.getElementById('movePad');
const moveStick = document.getElementById('moveStick');

function updatePad(clientX, clientY) {
  const rect = movePad.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const max = 46;
  const dist = Math.min(Math.hypot(dx, dy), max);
  const angle = Math.atan2(dy, dx);
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;

  stickVector.x = x / max;
  stickVector.y = -y / max;
  moveStick.style.transform = `translate(${x - 34}px, ${y - 34}px)`;
}

movePad.addEventListener('pointerdown', (e) => {
  padActive = true;
  updatePad(e.clientX, e.clientY);
});
movePad.addEventListener('pointermove', (e) => {
  if (padActive) updatePad(e.clientX, e.clientY);
});
movePad.addEventListener('pointerup', () => {
  padActive = false;
  stickVector.x = 0;
  stickVector.y = 0;
  moveStick.style.transform = 'translate(-50%, -50%)';
});
movePad.addEventListener('pointerleave', () => {
  padActive = false;
  stickVector.x = 0;
  stickVector.y = 0;
  moveStick.style.transform = 'translate(-50%, -50%)';
});

window.addEventListener('keydown', (e) => {
  keyState[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  keyState[e.key.toLowerCase()] = false;
});

let matchState = {
  phase: 'loading',
  timer: 90,
  homeScore: 0,
  awayScore: 0,
  gameOver: false,
  introTime: 0,
  prepared: false
};

function showMessage(text, duration = 1200) {
  messageEl.textContent = text;
  messageEl.style.opacity = '1';
  clearTimeout(showMessage.timerId);
  showMessage.timerId = setTimeout(() => {
    messageEl.style.opacity = '0';
  }, duration);
}

function setLoading(progress, text) {
  loadingBar.style.width = `${progress}%`;
  loadingText.textContent = text;
}

window.addEventListener('load', () => {
  setLoading(25, 'Loading stadium...');
  setTimeout(() => setLoading(60, 'Building pitch...'), 200);
  setTimeout(() => setLoading(85, 'Preparing squads...'), 600);
  setTimeout(() => setLoading(100, 'Ready'), 1000);
  setTimeout(() => {
    loadingScreen.classList.remove('visible');
    loadingScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    menuScreen.classList.add('visible');
    matchState.phase = 'menu';
  }, 1400);
});

function clampPlayer(p) {
  const x = THREE.MathUtils.clamp(p.mesh.position.x, -pitchLength / 2 + 2, pitchLength / 2 - 2);
  const z = THREE.MathUtils.clamp(p.mesh.position.z, -pitchWidth / 2 + 2, pitchWidth / 2 - 2);
  p.mesh.position.set(x, 0, z);
}

function createIntroPlacement() {
  const homePositions = [
    [-18, -12], [-18, 12], [-15, 0], [-12, -18], [-12, 18],
    [-8, -10], [-8, 10], [-4, -16], [-4, 16], [-1, 0], [-1, 22]
  ];

  const awayPositions = [
    [18, 12], [18, -12], [15, 0], [12, 18], [12, -18],
    [8, 10], [8, -10], [4, 16], [4, -16], [1, 0], [1, -22]
  ];

  homeTeam.forEach((p, i) => {
    const [x, z] = homePositions[i] || [-18, 0];
    p.mesh.position.set(x, 0, z);
    p.introTarget.set(homeTeam[i].home.x, 0, homeTeam[i].home.z);
  });

  awayTeam.forEach((p, i) => {
    const [x, z] = awayPositions[i] || [18, 0];
    p.mesh.position.set(x, 0, z);
    p.introTarget.set(awayTeam[i].home.x, 0, awayTeam[i].home.z);
  });

  referee.position.set(-2, 0, -20);
}

let introStartTime = 0;

function beginMatchIntro() {
  matchState.phase = 'intro';
  matchState.introTime = 0;
  introStartTime = Date.now();
  createIntroPlacement();
  showMessage('Stadium walk-out', 1500);

  const run = setInterval(() => {
    if (matchState.phase !== 'intro') {
      clearInterval(run);
      return;
    }

    const elapsed = (Date.now() - introStartTime) / 1000;
    if (elapsed > 4.5) {
      matchState.phase = 'live';
      matchState.timer = 90;
      timerEl.textContent = '90';
      showMessage('Kick Off!', 1400);
      audio.whistle();
      clearInterval(run);
    }
  }, 80);
}

function startMatch() {
  if (homeTeamSelect.value === awayTeamSelect.value) {
    awayTeamSelect.value = ['Barcelona', 'Arsenal', 'Real Madrid', 'PSG', 'Bayern', 'Chelsea', 'Juventus', 'Manchester City'].find((v) => v !== homeTeamSelect.value) || 'Barcelona';
  }

  menuScreen.classList.remove('visible');
  menuScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  controls.classList.remove('hidden');
  audio.start();
  buildTeams();
  resetTeams();
  createIntroPlacement();
  matchState.homeScore = 0;
  matchState.awayScore = 0;
  matchState.gameOver = false;
  homeScoreEl.textContent = '0';
  awayScoreEl.textContent = '0';
  homeTeamSelect.disabled = true;
  awayTeamSelect.disabled = true;
  beginMatchIntro();
}

startBtn.addEventListener('click', startMatch);

function resetMatch() {
  if (!userPlayer) return;
  matchState.timer = 90;
  matchState.gameOver = false;
  timerEl.textContent = '90';
  homeScoreEl.textContent = '0';
  awayScoreEl.textContent = '0';
  matchState.homeScore = 0;
  matchState.awayScore = 0;
  buildTeams();
  resetTeams();
  createIntroPlacement();
  beginMatchIntro();
}

resetBtn.addEventListener('click', resetMatch);

let shotQueued = false;
let passQueued = false;
let actionCooldown = 0;

shotBtn.addEventListener('pointerdown', () => {
  shotQueued = true;
});
passBtn.addEventListener('pointerdown', () => {
  passQueued = true;
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') shotQueued = true;
  if (e.key.toLowerCase() === 'p') passQueued = true;
});

function tryShot() {
  if (!userPlayer) return;
  const p = userPlayer;
  const toBall = new THREE.Vector3(ballBody.position.x - p.mesh.position.x, 0, ballBody.position.z - p.mesh.position.z);
  if (toBall.length() < 1.8) {
    const dir = toBall.clone().normalize();
    const force = new THREE.Vector3(dir.x * 12.8, 6.4, dir.z * 12.8);
    ballBody.applyImpulse(new CANNON.Vec3(force.x, force.y, force.z), new CANNON.Vec3(0, 0, 0));
    audio.kick();
    showMessage('Shot!');
  }
}

function tryPass() {
  if (!userPlayer) return;
  const p = userPlayer;
  const teammates = homeTeam.filter((player) => player !== p);
  const target = teammates.reduce((best, current) => {
    const bestDist = best ? best.mesh.position.distanceToSquared(p.mesh.position) : Infinity;
    const currentDist = current.mesh.position.distanceToSquared(p.mesh.position);
    return currentDist < bestDist ? current : best;
  }, teammates[0]);

  const toBall = new THREE.Vector3(ballBody.position.x - p.mesh.position.x, 0, ballBody.position.z - p.mesh.position.z);
  if (toBall.length() < 2.1 && target) {
    const dir = target.mesh.position.clone().sub(p.mesh.position).normalize();
    ballBody.applyImpulse(new CANNON.Vec3(dir.x * 9.5, 5.6, dir.z * 9.5), new CANNON.Vec3(0, 0, 0));
    audio.pass();
    showMessage('Pass!');
  }
}

function handleActions() {
  if (shotQueued && actionCooldown <= 0) {
    actionCooldown = 0.48;
    tryShot();
    shotQueued = false;
  }

  if (passQueued && actionCooldown <= 0) {
    actionCooldown = 0.52;
    tryPass();
    passQueued = false;
  }

  if (actionCooldown > 0) actionCooldown -= 1 / 60;
}

function updateUser(dt) {
  if (!userPlayer || matchState.phase !== 'live') return;

  const p = userPlayer;
  const xAxis = (keyState.d || keyState.arrowright ? 1 : 0) - (keyState.a || keyState.arrowleft ? 1 : 0);
  const zAxis = (keyState.w || keyState.arrowup ? 1 : 0) - (keyState.s || keyState.arrowdown ? 1 : 0);

  const finalX = xAxis + stickVector.x;
  const finalY = zAxis + stickVector.y;
  const len = Math.hypot(finalX, finalY);

  if (len > 0.01) {
    const dirX = finalX / len;
    const dirY = finalY / len;
    const speed = p.speed * dt * 8.5;
    p.mesh.position.x += dirX * speed;
    p.mesh.position.z += dirY * speed;
    p.mesh.rotation.y = Math.atan2(dirX, dirY);
  }

  clampPlayer(p);

  const toBall = new THREE.Vector3(ballBody.position.x - p.mesh.position.x, 0, ballBody.position.z - p.mesh.position.z);
  if (toBall.length() < 1.7) {
    p.mesh.position.x += toBall.x * 0.02;
    p.mesh.position.z += toBall.z * 0.02;
  }
}

function scoreGoal(side) {
  if (matchState.gameOver) return;

  if (side === 'home') matchState.homeScore += 1;
  else matchState.awayScore += 1;

  homeScoreEl.textContent = String(matchState.homeScore);
  awayScoreEl.textContent = String(matchState.awayScore);
  audio.goal();
  showMessage(side === 'home' ? 'Goal for home!' : 'Goal for away!', 1500);
  ballBody.position.set(0, 0.8, 0);
  ballBody.velocity.set(0, 0, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  resetTeams();
  createIntroPlacement();
}

function checkGoals() {
  const x = ballBody.position.x;
  const z = ballBody.position.z;
  const inGoal = Math.abs(z) < goalWidth / 2 + 0.8;

  if (x > pitchLength / 2 - 1.3 && inGoal && ballBody.position.y < 2.2) {
    scoreGoal('home');
  } else if (x < -pitchLength / 2 + 1.3 && inGoal && ballBody.position.y < 2.2) {
    scoreGoal('away');
  }
}

function updateAI(dt) {
  const allTeams = [homeTeam, awayTeam];
  for (const team of allTeams) {
    for (const p of team) {
      if (p.isUser || matchState.phase !== 'live') continue;

      const toBall = new THREE.Vector3(ballBody.position.x - p.mesh.position.x, 0, ballBody.position.z - p.mesh.position.z);
      const dist = toBall.length();

      let desired = new THREE.Vector3();
      if (dist > 4.2) {
        desired.copy(toBall).normalize();
      } else if (dist < 2.2) {
        desired.copy(toBall).normalize().multiplyScalar(-0.8);
      } else {
        desired.copy(p.home).sub(p.mesh.position);
        if (desired.lengthSq() > 0.01) desired.normalize();
      }

      const homePull = p.home.clone().sub(p.mesh.position).multiplyScalar(0.18);
      desired.add(homePull);

      if (p.team === 'away') desired.x += 0.45;
      else desired.x -= 0.45;

      if (desired.lengthSq() > 0.001) desired.normalize();

      p.mesh.position.x += desired.x * p.speed * dt * 8.5;
      p.mesh.position.z += desired.z * p.speed * dt * 8.5;
      p.mesh.rotation.y = Math.atan2(desired.x, desired.z);
      clampPlayer(p);

      if (dist < 2.4 && Math.random() < 0.04) {
        const goalDir = p.team === 'away'
          ? new THREE.Vector3(1, 0.7, (Math.random() - 0.5) * 1.8)
          : new THREE.Vector3(-1, 0.7, (Math.random() - 0.5) * 1.8);

        const force = goalDir.multiplyScalar(p.team === 'away' ? 11.2 : -11.2);
        ballBody.applyImpulse(new CANNON.Vec3(force.x, 6.6 + Math.random() * 0.8, force.z * 0.9), new CANNON.Vec3(0, 0, 0));
        audio.kick();
      }
    }
  }
}

function updateClock(dt) {
  if (matchState.phase !== 'live' || matchState.gameOver) return;
  matchState.timer -= dt;

  if (matchState.timer <= 0) {
    matchState.timer = 0;
    matchState.gameOver = true;
    showMessage('Full Time!', 1800);
  }

  timerEl.textContent = String(Math.ceil(matchState.timer));
}

function updateReferee(dt) {
  referee.rotation.y = Math.atan2(userPlayer ? userPlayer.mesh.position.x - referee.position.x : 0, userPlayer ? userPlayer.mesh.position.z - referee.position.z : 0);
  if (matchState.phase === 'intro') {
    referee.position.x = THREE.MathUtils.lerp(referee.position.x, -0.5, 0.02);
    referee.position.z = THREE.MathUtils.lerp(referee.position.z, -18 + Math.sin(Date.now() * 0.003) * 0.8, 0.03);
    referee.position.y = 0;
  } else {
    const targetX = userPlayer ? userPlayer.mesh.position.x * 0.4 : 0;
    referee.position.x = THREE.MathUtils.lerp(referee.position.x, targetX, 0.03);
    referee.position.z = THREE.MathUtils.lerp(referee.position.z, -18, 0.02);
  }
}

function updateCrowd(dt) {
  stadium.children.forEach((child, idx) => {
    if (child.geometry && child.geometry.type === 'BoxGeometry' && child.position.z > pitchWidth / 2 + 5 || child.position.z < -pitchWidth / 2 - 5) {
      child.rotation.y = Math.sin(Date.now() * 0.002 + idx) * 0.08;
    }
  });
}

function updateBallMesh() {
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);
}

let lastFrame = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastFrame) / 1000 || 0.016, 0.04);
  lastFrame = now;

  world.step(1 / 60);

  audio.updateMusic(now);

  if (matchState.phase === 'intro') {
    const introProgress = (now - introStartTime) / 1000;
    const moveFactor = Math.min(introProgress / 4.5, 1);
    for (const p of homeTeam) {
      p.mesh.position.lerp(p.introTarget, 0.05 + moveFactor * 0.02);
    }
    for (const p of awayTeam) {
      p.mesh.position.lerp(p.introTarget, 0.05 + moveFactor * 0.02);
    }
    referee.position.x = THREE.MathUtils.lerp(referee.position.x, 0.5, 0.05);
    referee.position.z = THREE.MathUtils.lerp(referee.position.z, -10, 0.04);
  }

  if (matchState.phase === 'live') {
    updateUser(dt);
    updateAI(dt);
    handleActions();
    updateClock(dt);
    checkGoals();
  }

  updateReferee(dt);
  updateCrowd(dt);
  updateBallMesh();

  const focus = userPlayer ? userPlayer.mesh.position.clone() : new THREE.Vector3(0, 0, 0);
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, focus.x * 0.75, 0.06);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, 32, 0.05);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, 18, 0.05);
  camera.lookAt(focus.x, 1.2, 0);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

buildTeams();
resetTeams();
