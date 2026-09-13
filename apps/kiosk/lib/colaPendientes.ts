const NOMBRE_DB = "kiosco-checkin";
const VERSION_DB = 1;
const ALMACEN = "pendientes";

export interface CheckInPendiente {
  id: number;
  cedula: string;
  // Solo para mostrarle al staff cuándo se encoló — NO es la fechaHora real
  // del check-in, esa la pone el servidor cuando finalmente se procesa.
  encoladoEn: string;
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_DB, VERSION_DB);

    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: "id", autoIncrement: true });
      }
    };

    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

export async function encolar(cedula: string): Promise<void> {
  const db = await abrirDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).add({ cedula, encoladoEn: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listarPendientes(): Promise<CheckInPendiente[]> {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, "readonly");
    const solicitud = tx.objectStore(ALMACEN).getAll();
    solicitud.onsuccess = () => resolve(solicitud.result as CheckInPendiente[]);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

export async function quitarPendiente(id: number): Promise<void> {
  const db = await abrirDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
