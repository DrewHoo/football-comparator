// The UEFA Euro 2000 lineup parser now lives in pipeline/lib/archive/uefa.mjs (it carries a fix
// for lineup rows whose home half is empty). This file re-exports it so research scripts keep working.
export { parseUefaLineups } from '../../pipeline/lib/archive/uefa.mjs'
