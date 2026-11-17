import './style.css';
import { createBird } from './bird';
import { channels, rest } from './motion';
import { createTracking } from './tracking';

function element<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}

const stage = element('stage');
const canvas = element<HTMLCanvasElement>('bird');
const video = element<HTMLVideoElement>('camera');
const errorDisplay = element('error');
const show = element<HTMLButtonElement>('show');
const connect = element<HTMLButtonElement>('connect');

function cameraError(message: string) {
  video.hidden = true;
  errorDisplay.textContent = message;
  errorDisplay.hidden = false;
  connect.hidden = false;
}

const tracking = createTracking(video, cameraError);
let starting = false;

async function startCamera() {
  if (starting) return;
  starting = true;
  connect.hidden = errorDisplay.hidden = true;
  try {
    if (await tracking.start()) video.hidden = false;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    cameraError(!navigator.mediaDevices
      ? 'Open this file in Chrome or Brave to use the camera.'
      : name === 'NotAllowedError'
        ? 'Allow camera access in your browser, then try again.'
        : name === 'NotFoundError' || name === 'NotReadableError'
          ? 'Camera unavailable.'
          : 'Camera tracking could not start.');
    console.error(error);
  } finally {
    starting = false;
  }
}
connect.addEventListener('click', () => void startCamera());

function enterShow() {
  document.body.classList.add('show');
  void stage.requestFullscreen?.().catch(() => {});
}
function exitShow() {
  if (!document.body.classList.contains('show')) return;
  document.body.classList.remove('show');
  if (document.fullscreenElement === stage) void document.exitFullscreen().catch(() => {});
  show.focus();
}
show.addEventListener('click', enterShow);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') exitShow();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) exitShow();
  else if (!document.body.classList.contains('show') && document.fullscreenElement === stage) {
    void document.exitFullscreen().catch(() => {});
  }
});
let lastTap: PointerEvent | undefined;
stage.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' || !event.isPrimary || !document.body.classList.contains('show')) return;
  if (lastTap && event.timeStamp - lastTap.timeStamp < 900
    && Math.hypot(event.clientX - lastTap.clientX, event.clientY - lastTap.clientY) < 48) {
    lastTap = undefined;
    exitShow();
  } else lastTap = event;
});
canvas.addEventListener('dblclick', exitShow);

async function render() {
  const bird = await createBird(canvas);
  new ResizeObserver(bird.resize).observe(stage);
  const current = { ...rest };
  let previous = performance.now();
  let contextLost = false;

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    exitShow();
    show.disabled = true;
    errorDisplay.textContent = 'Graphics paused. Reload if the macaw does not return.';
    errorDisplay.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    show.disabled = false;
    if (connect.hidden) errorDisplay.hidden = true;
    bird.resize();
  });

  function frame(now: number) {
    requestAnimationFrame(frame);
    const delta = Math.min(.15, Math.max(0, now - previous) / 1000);
    previous = now;
    if (contextLost || document.hidden) return;
    try {
      tracking.sample(now);
    } catch (error) {
      tracking.stop();
      cameraError('Camera tracking stopped. Try again.');
      console.error(error);
    }
    const target = tracking.motion();
    for (const channel of channels) {
      const response = channel === 'jaw' ? .035 : .062;
      current[channel] += (target[channel] - current[channel]) * (1 - Math.exp(-delta / response));
    }
    bird.draw(current, now / 1000);
  }

  bird.resize();
  show.disabled = false;
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => tracking.forget());
window.addEventListener('pagehide', () => tracking.stop());
window.addEventListener('pageshow', event => {
  if (event.persisted) void startCamera();
});
void startCamera();
void render().catch(error => {
  errorDisplay.textContent = 'The 3D preview requires WebGL 2.';
  errorDisplay.hidden = false;
  console.error(error);
});
