// Apply each group to the named TOP-LEVEL native factory FunctionDeclaration.
// Nested x/S/w/_ names are deliberately matched inside that one audited node.
// With no chapter5 owner all branches retain their exact original behavior.
export const CH5_NATIVE_ADAPTERS=[
  {scope:'Q_',name:'ch5GullTarget',replacements:[
    ['let b=s.player,m=i.t;', 'let b=i.chapter5?.owns(d)?i.chapter5.target(d):s.player,m=i.t;'],
    ['if(d.pos.addScaledVector(d.vel,y),!d.hoverFixed)',
      'if(i.chapter5?.owns(d)?i.chapter5.moveGull(d,y):d.pos.addScaledVector(d.vel,y),!d.hoverFixed)'],
    ['s.combat.explode(d.pos,Pn.explodeRadius,Pn.explodeDamage,"enemy")',
      's.combat.explode(d.pos,Pn.explodeRadius,Pn.explodeDamage,"enemy",d)'],
  ]},
  {scope:'iM',name:'ch5HoundTarget',replacements:[
    ['let T=s.player;if(!T)return;', 'let T=i.chapter5?.owns(m)?i.chapter5.target(m):s.player;if(!T)return;'],
    ['let D=s.player,C=i.t;', 'let D=i.chapter5?.owns(m)?i.chapter5.target(m):s.player,C=i.t;'],
    ['{damage:Gt.shotDamage,range:200}', '{damage:Gt.shotDamage,range:200,owner:m}'],
    ['K<Gt.lungeRange&&m.lungeCd<=0&&D.alive', 'K<Gt.lungeRange&&m.lungeCd<=0&&D.alive&&(!i.chapter5?.owns(m)||i.chapter5.canMelee(m,D))'],
    ['K<1.35&&D.alive&&(D.damage(Gt.lungeDamage,m.pos)',
      'K<1.35&&D.alive&&(!i.chapter5?.owns(m)||i.chapter5.canMelee(m,D))&&(i.chapter5?.owns(m)?i.chapter5.melee(m,D,Gt.lungeDamage):D.damage(Gt.lungeDamage,m.pos)'],
  ]},
  {scope:'Em',name:'ch5GullProjectile',replacements:[
    ['G.on=!0,G.life=1.3,G.pos.copy(T)', 'G.on=!0,G.owner=C,G.ownerId=C?.id,G.life=1.3,G.pos.copy(T)'],
    ['if(!j.on)continue;let N=Ui.gull.boltSpeed*T;',
      'if(!j.on)continue;if(h.chapter5?.ownsBolt(j)&&!h.chapter5.active())continue;let N=Ui.gull.boltSpeed*T;'],
    ['let Q=i.physics.raycast(j.pos,j.dir,N),K=Q?Q.dist:N,ie=!1;',
      'let Q=i.physics.raycast(j.pos,j.dir,N),K=Q?Q.dist:N,ie=!1;if(h.chapter5?.ownsBolt(j)){if(h.chapter5.projectile(j,N)){j.on=!1;continue}D=null}else D=i.player;'],
  ]},
]
