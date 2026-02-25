// Demo: JavaScript en proyecto estático
const msg = document.getElementById('msg');
const now = new Date().toLocaleTimeString('es-ES');
msg.textContent = `Proyecto estático cargado correctamente a las ${now}`;
msg.style.color = '#4ade80';
console.log('Static folder demo loaded');
