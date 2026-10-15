const device = document.querySelector('#device');
const viewport = document.querySelector('#viewport');
const frame = document.querySelector('#site-preview');

function setViewport() {
  const width = Number(viewport.value);
  if (Number.isFinite(width)) device.style.setProperty('--device-width', `${width + 22}px`);
}

function reloadPreview() {
  const url = new URL('/admin/', window.location.origin);
  url.searchParams.set('preview', 'mobile');
  url.searchParams.set('refresh', String(Date.now()));
  frame.src = url.toString();
}

viewport.addEventListener('change', setViewport);
document.querySelector('#reload-preview').addEventListener('click', reloadPreview);
setViewport();
