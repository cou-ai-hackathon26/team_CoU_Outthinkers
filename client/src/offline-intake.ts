export type OfflineStatus = "SAVED_OFFLINE" | "WAITING_TO_SYNC" | "UPLOADING" | "PROCESSED" | "SYNC_FAILED";
export type OfflineIntake = { localId: string; sourceType: "VOICE" | "MANUAL"; text: string; audio?: Blob; mimeType?: string; createdAt: number; status: OfflineStatus; error?: string };

const DB = "maternacare-offline-v1";
const STORE = "intakes";
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "localId" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export async function saveOfflineIntake(item: OfflineIntake) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(item); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
export async function getOfflineIntakes(): Promise<OfflineIntake[]> { const db = await openDb(); const values = await new Promise<OfflineIntake[]>((resolve, reject) => { const req = db.transaction(STORE).objectStore(STORE).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); db.close(); return values.sort((a,b) => b.createdAt-a.createdAt); }
export async function getOfflineIntake(localId: string): Promise<OfflineIntake | undefined> { const db = await openDb(); const value = await new Promise<OfflineIntake|undefined>((resolve,reject) => { const req=db.transaction(STORE).objectStore(STORE).get(localId); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); db.close(); return value; }
