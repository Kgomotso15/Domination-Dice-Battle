
// The entry point: the first JavaScript file the page loads (see index.html).

import { isFirebaseConfigured } from './config/firebase-config.js'

if (!isFirebaseConfigured) {
  // No Firebase config yet: show a helpful notice instead of a broken page.
  document.querySelector('#setupNotice').hidden = false
  document.querySelector('#menu').hidden = true
  document.querySelector('#loading').classList.add('done')
} else {
  // Load the app only now, so a missing config can never cause a crash above.
  const { AppController } = await import('./controllers/AppController.js')
  new AppController().init()
}
