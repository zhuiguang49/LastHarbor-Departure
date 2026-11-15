import { CH2_SECTIONS } from './campaign-ch2-layout.mjs'

// Static runtime cover pockets; the original 18-point environment fixture stays separate.
// Local incoming LOS and exact native paths: b1b-pressure-ai/deployment-evidence.json.
const positions={
  'ch2.s1':[[-76.5,-289.5],[-82,-289.5],[-94.5,-282],[-92.5,-282],[-105.5,-276.5],[-118,-271],[-79.5,-290],[-86.5,-289.5],[-101,-283],[-83,-285],[-112,-281.5],[-105,-274.7]],
  'ch2.s2':[[-123,-251],[-125.5,-248],[-117.5,-237.5],[-123.5,-229.5],[-144.5,-240],[-149.5,-218],[-124.5,-250],[-117.5,-248],[-124.5,-231],[-146.5,-254],[-149.5,-229],[-144.5,-218]],
  'ch2.s3':[[-109.5,-188],[-108,-187.5],[-101,-185.5],[-93.5,-189.5],[-86.5,-192.5],[-76,-188.5],[-106,-186],[-104.4,-186],[-98.5,-187.5],[-94.5,-190.5],[-81,-192.5],[-76.6,-187.2]],
}
const posts={
  'ch2.s1':[[90,'forklift-corner-patrol'],[90,'s-bend-patrol'],[90,'open-container'],[180,'open-exit-watch'],[90,'corner-watch'],[0,'return-cargo-watch'],
    [90,'bend-entry'],[90,'bend-exit'],[90,'cargo-exit'],[0,'forklift-return-tracker'],[90,'west-container-tracker'],[0,'west-entry-tracker']],
  'ch2.s2':[[180,'main-patrol'],[180,'main-patrol'],[0,'open-container'],[180,'north-turn'],[0,'maintenance-watch'],[180,'maintenance-exit'],
    [180,'south-chicane'],[180,'cargo-entry'],[180,'main-turn'],[180,'maintenance-entry-tracker'],[180,'maintenance-turn-tracker'],[90,'maintenance-return-tracker']],
  'ch2.s3':[[0,'rack-approach-patrol'],[90,'rack-patrol'],[90,'first-blind-turn'],[180,'second-blind-turn'],[90,'open-container'],[90,'exit-watch'],
    [90,'rack-side'],[90,'first-corner'],[180,'blind-aisle'],[180,'second-corner-tracker'],[90,'cargo-exit-tracker'],[90,'exit-turn-tracker']],
}

export const CH2_INFECTED_DEPLOYMENT=Object.freeze(CH2_SECTIONS.flatMap(({id:sectionId})=>{
  return positions[sectionId].map(([x,z],index)=>{
    const spawn={id:`${sectionId}.z${index+1}`,sectionId,position:Object.freeze({x,y:0,z}),debugOnly:true}
    const [degrees,post]=posts[sectionId][index],omniscientTracking=index>=9
    return Object.freeze({...spawn,mode:omniscientTracking?'omniscient-tracker':'ordinary',omniscientTracking,
      initialYaw:degrees*Math.PI/180,post,patrol:index<2})
  })
}))
