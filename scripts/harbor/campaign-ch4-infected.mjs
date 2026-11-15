import { createChapter2InfectedDirector } from './campaign-ch2-director.mjs'
import { CH4_INFECTED_SECTION, CH4_INFECTED_SPAWNS } from './campaign-ch4-infected-layout.mjs'

// The same five actors own their CH2 combat, sound and crowd behavior for a run.
// A concrete section selects native navigation and disables full-CH2 sleeping.
export function createChapter4InfectedDirector(g,{asset,bank,enabled=true}) {
  return createChapter2InfectedDirector(g,{sectionId:CH4_INFECTED_SECTION.id,asset,bank,enabled,
    deployment:{section:CH4_INFECTED_SECTION,spawns:CH4_INFECTED_SPAWNS}})
}
