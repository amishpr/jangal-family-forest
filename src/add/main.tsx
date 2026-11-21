import '@fontsource-variable/source-sans-3/wght.css'
import '@fontsource-variable/figtree/wght.css'
import '../styles/app.css'
import '../styles/gujarati.css'
import './add.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { decodeAskLink } from '../core/askLink'
import { AddPage, BadLink } from './AddPage'

// The fill-in page (SHARE.md SH-4): its own small page, not the app, so a relative never loads the
// tree app, its database or its service worker. Everything it needs comes from the link.

const link = decodeAskLink(location.hash)

createRoot(document.getElementById('root')!).render(<StrictMode>{link ? <AddPage link={link} /> : <BadLink />}</StrictMode>)
