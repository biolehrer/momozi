import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { unlockAudio } from './lib/audio.svelte'

// Wiedergabe bei jeder Berührung entsperren (nötig für automatisches Abspielen auf iOS)
window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true })
window.addEventListener('keydown', unlockAudio, { capture: true, passive: true })

const app = mount(App, { target: document.getElementById('app')! })

export default app
