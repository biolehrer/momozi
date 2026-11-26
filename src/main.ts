import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initAudio } from './lib/audio.svelte'
import { initPwa } from './lib/pwa.svelte'

// Offline-Modus (Service Worker) – nur im fertigen Build
initPwa()

// Aussprache: bei jeder Berührung entsperren (nötig für automatisches Abspielen auf iOS), nach dem Sperren neu starten
initAudio()

const app = mount(App, { target: document.getElementById('app')! })

export default app
