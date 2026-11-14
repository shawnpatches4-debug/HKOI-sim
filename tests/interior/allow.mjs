// Contacts between interior assemblies that are meant: [assembly, assembly, reason]. Names match from the start.
export const ALLOW = [
  ['gun', 'part:breech', 'the breech slides inside the cradle of the gun mount'],
  ['part:block', 'part:breech', 'the breech block slides in the breech ring'],
  ['aux-sight', 'gun', 'the auxiliary telescope passes through the gun mount to look out beside the gun'],
  ['bustle', 'part:round', 'a round slides out of its tube through the face of the rack'],
  ['console1', 'gunner-handles', 'the bracket of the control handles is bolted under the sight panel'],
  ['part:cupHatch', 'part:cupPost', 'the collar of the commander\'s hatch arm rides on its post'],
  ['cupola', 'part:cupPost', 'the hatch post stands on the back of the cupola'],
  ['part:cupHatch', 'part:cupHole', 'the dark disc of the open hatchway (outside views only) lies just under the lid'],
  ['part:hatch', 'part:ldrHole', 'the dark disc of the open hatchway (outside views only) lies just under the lid'],
  ['loader', 'part:hatch', 'the loader\'s hatch lid turns in its hinge block on the roof'],
  ['basket', 'hull-tub', 'the round basket floor is tested here as a square box; the true clearance is tested separately below (hull fittings at least 1.02 m from the turret axis)'],
];
