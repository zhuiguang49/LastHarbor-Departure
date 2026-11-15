// CH1 authored anchors. Five-sector boundaries and the native spawn stay fixed.
// Warehouse uses the complete native ab() building translated from Berth 7.
export const CH1 = Object.freeze({
  warehouse: Object.freeze({ offset: Object.freeze([17, 0, -309]),
    bounds: Object.freeze({ minX: 1, maxX: 29, minZ: -337, maxZ: -320 }),
    entrance: Object.freeze([13, 0, -319]) }),
  request: Object.freeze([-15, 1.2, -301]),
  isolation: Object.freeze([-23, 1.1, -305]),
  power: Object.freeze([-35, 1.1, -319]),
  generator: Object.freeze([-39, 0, -320]),
  relay: Object.freeze([-36, 0, -320]),
  gate: Object.freeze([-57.5, 1.2, -285]),
  pickups: Object.freeze({
    pistol: Object.freeze({ position: Object.freeze([-7.4, 1.12, -323]), yaw: Math.PI / 2 }),
    rifle: Object.freeze({ position: Object.freeze([23, 1.12, -335.8]), yaw: 0 }),
    knife: Object.freeze({ position: Object.freeze([25, 1.12, -335.8]), yaw: 0 }),
  }),
  supplies: Object.freeze({ position: Object.freeze([27, 1.12, -335.8]), yaw: 0 }),
  exitSupplies: Object.freeze({ position: Object.freeze([-55.5, 1.12, -282]), yaw: Math.PI / 2 }),
  ambush: Object.freeze([
    Object.freeze({ kind: 'hound', position: Object.freeze([-15, 0, -293]) }),
    Object.freeze({ kind: 'hound', position: Object.freeze([-30, 0, -289]) }),
    Object.freeze({ kind: 'gull', position: Object.freeze([-5, 6, -282]) }),
  ]),
  patrolSites: Object.freeze([
    Object.freeze([-50, -327]), Object.freeze([-49, -301]), Object.freeze([-45, -275]),
    Object.freeze([-15, -275]), Object.freeze([19, -306]), Object.freeze([7, -296]),
  ]),
})
