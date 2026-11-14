// Contacts between interior assemblies that are meant: [assembly, assembly, reason]. Names match from the start.
export const ALLOW = [
  ['gun', 'part:breech', 'the breech slides inside the cradle of the gun mount'],
  ['part:block', 'part:breech', 'the breech block slides in the breech ring'],
  ['aux-sight', 'gun', 'the auxiliary telescope passes through the gun mount to look out beside the gun'],
  ['bustle', 'part:round', 'a round slides out of its tube through the face of the rack'],
  ['part:tbar', 'part:throttle', 'the twist grip turns on the end of the T-bar'],
  ['driver', 'part:tbar', 'the T-bar hangs from its stem under the control box'],
  ['basket', 'hull-tub', 'the round basket floor is tested here as a square box; the true clearance is tested separately below (hull fittings at least 1.02 m from the turret axis)'],
];
