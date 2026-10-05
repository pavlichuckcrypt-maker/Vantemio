// The seller workspace shares the checkout's single wallet client, durable
// journal and Web Locks. Importing this bridge never connects or signs.
let adapter=null;
export function bindWalletWorkspace(value){adapter=value;}
export const getWalletSnapshot=()=>adapter?.getWalletSnapshot()||null;
export const getMarketSnapshot=()=>adapter?.getMarketSnapshot()||null;
export async function runSellerCommand(action,extra={}){if(!adapter)throw new Error('Wallet session required');return adapter.runSellerCommand(action,extra);}
export async function cancelSellerReservation(productId,key){if(!adapter)throw new Error('Wallet session required');return adapter.cancelSellerReservation(productId,key);}
