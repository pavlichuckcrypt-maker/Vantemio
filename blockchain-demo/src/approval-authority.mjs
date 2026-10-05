// A threshold alone is insufficient: every demo signer must match the pinned authority.
export function registeredSafeOwnersMatch(actual,expected,threshold){
  const normalize=list=>Array.isArray(list)&&list.length===5&&list.every(a=>typeof a==='string'&&/^0x[a-fA-F0-9]{40}$/.test(a))
    ?list.map(a=>a.toLowerCase()).sort():null;
  const a=normalize(actual),e=normalize(expected);
  return Number(threshold)===3&&!!a&&!!e&&new Set(a).size===5&&new Set(e).size===5&&JSON.stringify(a)===JSON.stringify(e);
}
