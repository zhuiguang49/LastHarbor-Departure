// Final user-exported labels, not inferred from source animation names.
// Only valid for this complete mesh/skin/animation package.
export const INFECTED_CLIP_SOURCE_SHA = '8b5319bdb04e67ecd90045e81870dcaab1148aee3603083c792a6a00d8084e33'
export const INFECTED_CLIP_FEEDBACK_SHA = '69ceda2f18dad8bed986c9809bf4eb24da19b68738ad0ab1d6eb8a987abbb3d2'

export const INFECTED_CLIPS = Object.freeze(Object.fromEntries([
  ['Idle',9,1.9583333730697632,true,.15],
  ['Walk',0,3.9583332538604736,true,.15],
  ['Run',1,3.9583332538604736,true,.15],
  ['Alert',4,1.9583333730697632,false,.15],
  ['Search',7,3.9583332538604736,true,.15],
  ['Crouch Idle',2,4.958333492279053,true,.15],
  ['Crouch to Stand',10,1.9583333730697632,false,.15],
  ['Attack',3,1.9583333730697632,false,.12],
  ['Lunge Attack',6,1.9583333730697632,false,.12],
  ['Hit',5,1.9583333730697632,false,.1],
  ['Death',8,1.9583333730697632,false,.1],
].map(([role,index,duration,loop,fade])=>[role,Object.freeze({index,duration,loop,fade})])))
