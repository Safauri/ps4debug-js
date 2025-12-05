# PS4Debug

A simple Node.js wrapper for PS4 debug communication. This library allows you to:

* Connect to a PS4 running ps4debug
* Send console notifications
* Read and write process memory
* Retrieve process lists and memory maps
* Allocate and free memory
* Install and call RPC functions

* This is a port from c# ps4debug only written in js
* Credit: https://github.com/jogolden/ps4debug

This README documents the API and provides usage examples.

## Basic Example

```js
const PS4Debug = require('./Utils/index');

(async () => {
  const ps4 = new PS4Debug();

  try {
    await ps4.connect('192.168.X.X');
    console.log('Connected');

    await ps4.notify(222, 'Hello, World');

    const { processArray } = await ps4.getProcessList();
    const proc = processArray.find(p => p.name.toLowerCase() === 'eboot.bin');
    console.log(`Found: ${proc?.name} (PID: ${proc?.id})`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    ps4.disconnect();
    console.log('Disconnected');
  }
})();
```

## API Reference

### connect(ip, port = 744)

Connects to the PS4 debug socket.

### disconnect()

Disconnects from the PS4.

### notify(type, message)

Sends a console notification.

### getProcessList()

Returns a list of running processes.

### getProcessMaps(pid)

Returns memory map entries for the specified process.

### readMemory(pid, address, length)

Reads raw memory.

### writeMemory(pid, address, buffer)

Writes raw memory.

### readUInt64(pid, address)

Reads a 64‑bit unsigned integer.

### writeUInt64(pid, address, value)

Writes a 64‑bit unsigned integer.

### writeString(pid, address, str)

Writes a null‑terminated ASCII string.

### allocateMemory(pid, length)

Allocates memory inside the process.

### freeMemory(pid, address, length)

Frees allocated memory.

### InstallRPC(pid)

Installs an RPC stub and returns its address.

### call(pid, rpcStub, functionAddress, ...args)

Performs an RPC function call.

### findProcess(name, exact = false)

Finds a process by name.

### findMapEntry(pid, name, contains = false)

Finds a memory map entry.

## Requirements

* PS4 running a compatible firmware with ps4debug payload
* Node.js v16 or higher

## Notes

* Ensure the PS4 and PC are on the same network.
* The utils module must correctly implement all packet operations.
