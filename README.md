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

## Requirements

* PS4 running a compatible firmware with ps4debug payload
* Node.js v16 or higher

## Notes

* Ensure the PS4 and PC are on the same network.
* The utils module must correctly implement all packet operations.
