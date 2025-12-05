const {
    default: PromiseSocket
} = require('promise-socket');
const {
    Socket
} = require('net');
const Utils = require('./utils');

/**
 * FRAME 4 = 2811
 * PS4DEBUG = 744
 */

class PS4Debug {
    constructor() {
        this.socket = new PromiseSocket(new Socket());
        this.socket.setTimeout(30000);
        this.isConnected = false;
    }

    /**
     * Connect to the PS4 socket.
     * @param {string} ip - Target IP address.
     * @param {number} [port=744] - Target port.
     * @returns {Promise<boolean>} True if connected.
     * @throws {Error} If connection fails.
     */
    async connect(ip, port = 744) {
        try {
            await this.socket.connect(port, ip);
            this.isConnected = true;
            return true;
        } catch (err) {
            throw new Error(`Connection failed: ${err.message}`);
        }
    }

    /**
     * Disconnect from the PS4 socket.
     * @returns {boolean} True if disconnected.
     */
    disconnect() {
        if (this.socket) this.socket.destroy();
        this.isConnected = false;
        return true;
    }

    /**
     * Ensure the socket is connected.
     * @throws {Error} If not connected.
     */
    checkConnected() {
        if (!this.isConnected) throw new Error("libdbg: not connected");
    }

    /**
     * Send a console notification.
     * @param {number} messageType - Notification type.
     * @param {string} message - Notification message.
     */
    async notify(messageType, message) {
        this.checkConnected();
        const buf = Buffer.from(message + '\0', 'ascii');
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_CONSOLE_NOTIFY, Utils.CMDS.CMD_CONSOLE_NOTIFY_PACKET_SIZE, [messageType, buf.length]);
        await Utils.sendData(this.socket, buf);
        await Utils.CheckStatus(this.socket);
    }

    /**
     * Get the list of processes.
     * @returns {Promise<{number:number, processArray:Array<{name:string,id:number}>}>}
     */
    async getProcessList() {
        this.checkConnected();
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_PROC_LIST, 0, []);
        await Utils.CheckStatus(this.socket);
        const number = (await Utils.receiveData(this.socket, 4)).readUInt32LE(0);
        const data = await Utils.receiveData(this.socket, number * Utils.CMDS.PROC_LIST_ENTRY_SIZE);
        const processArray = Array.from({
            length: number
        }, (_, i) => {
            const offset = i * Utils.CMDS.PROC_LIST_ENTRY_SIZE;
            return {
                name: Utils.convertASCII(data, offset),
                id: data.readUInt32LE(offset + 32)
            };
        });
        return {
            number,
            processArray
        };
    }

    /**
     * Get memory maps for a process.
     * @param {number} pid - Process ID.
     * @returns {Promise<{pid:number, entries:Array<{name:string,start:bigint,end:bigint,offsetValue:bigint,prot:number}>}>}
     */
    async getProcessMaps(pid) {
        this.checkConnected();
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_PROC_MAPS, Utils.CMDS.CMD_PROC_MAPS_PACKET_SIZE, [pid]);
        await Utils.CheckStatus(this.socket);
        const number = (await Utils.receiveData(this.socket, 4)).readInt32LE(0);
        const data = await Utils.receiveData(this.socket, number * Utils.CMDS.PROC_MAP_ENTRY_SIZE);
        const entries = Array.from({
            length: number
        }, (_, i) => {
            const offset = i * Utils.CMDS.PROC_MAP_ENTRY_SIZE;
            return {
                name: Utils.convertASCII(data, offset),
                start: data.readBigUInt64LE(offset + 32),
                end: data.readBigUInt64LE(offset + 40),
                offsetValue: data.readBigUInt64LE(offset + 48),
                prot: data.readUInt16LE(offset + 56)
            };
        });
        return {
            pid,
            entries
        };
    }

    /**
     * Read memory from a process.
     * @param {number} pid - Process ID.
     * @param {bigint|number} address - Memory address.
     * @param {number} length - Number of bytes to read.
     * @returns {Promise<Buffer>} Buffer containing the read data.
     */
    async readMemory(pid, address, length) {
        this.checkConnected();
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_PROC_READ, Utils.CMDS.CMD_PROC_READ_PACKET_SIZE, [pid, address, length]);
        await Utils.CheckStatus(this.socket);
        return Utils.receiveData(this.socket, length);
    }

    /**
     * Write memory to a process.
     * @param {number} pid - Process ID.
     * @param {bigint|number} address - Memory address.
     * @param {Buffer} data - Data to write.
     */
    async writeMemory(pid, address, data) {
        this.checkConnected();
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_PROC_WRITE, Utils.CMDS.CMD_PROC_WRITE_PACKET_SIZE, [pid, address, data.length]);
        await Utils.CheckStatus(this.socket);
        await Utils.sendData(this.socket, data);
        await Utils.CheckStatus(this.socket);
    }

    /**
     * Read a 64-bit unsigned integer from memory.
     * @param {number} pid - Process ID.
     * @param {bigint|number} address - Memory address.
     * @returns {Promise<bigint>} The value read.
     */
    async readUInt64(pid, address) {
        return (await this.readMemory(pid, address, 8)).readBigUInt64LE(0);
    }

    /**
     * Write a 64-bit unsigned integer to memory.
     * @param {number} pid - Process ID.
     * @param {bigint|number} address - Memory address.
     * @param {bigint|number} value - Value to write.
     */
    async writeUInt64(pid, address, value) {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(value));
        await this.writeMemory(pid, address, buf);
    }

    /**
     * Install RPC into a process.
     * @param {number} pid - Process ID.
     * @returns {Promise<bigint>} Address of installed RPC stub.
     */
    async InstallRPC(pid) {
        this.checkConnected();
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_PROC_INSTALL, Utils.CMDS.CMD_PROC_INSTALL_PACKET_SIZE, [pid]);
        await Utils.CheckStatus(this.socket);
        return (await Utils.receiveData(this.socket, Utils.CMDS.PROC_INSTALL_SIZE)).readBigUInt64LE(0);
    }

    /**
     * Free memory in a process.
     * @param {number} pid - Process ID.
     * @param {bigint|number} address - Memory address.
     * @param {number} length - Number of bytes to free.
     */
    async freeMemory(pid, address, length) {
        this.checkConnected();
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_PROC_FREE, Utils.CMDS.CMD_PROC_FREE_PACKET_SIZE, [pid, address, length]);
        await Utils.CheckStatus(this.socket);
    }

    /**
     * Allocate memory in a process.
     * @param {number} pid - Process ID.
     * @param {number} length - Number of bytes to allocate.
     * @returns {Promise<bigint>} Address of allocated memory.
     */
    async allocateMemory(pid, length) {
        this.checkConnected();
        await Utils.sendCMDPacket(this.socket, Utils.CMDS.CMD_PROC_ALLOC, Utils.CMDS.CMD_PROC_ALLOC_PACKET_SIZE, [pid, length]);
        await Utils.CheckStatus(this.socket);
        return (await Utils.receiveData(this.socket, Utils.CMDS.PROC_ALLOC_SIZE)).readBigUInt64LE(0);
    }

    /**
     * Write a null-terminated ASCII string to memory.
     * @param {number} pid - Process ID.
     * @param {bigint|number} address - Memory address.
     * @param {string} str - String to write.
     */
    async writeString(pid, address, str) {
        await this.writeMemory(pid, address, Buffer.from(str + '\0', 'ascii'));
    }

    /**
     * Perform a remote procedure call (RPC) on the PS4.
     *
     * @param {number} pid - Process ID of the target process.
     * @param {bigint|number} rpcstub - Address of the RPC stub.
     * @param {bigint|number} address - Function address to call.
     * @param {...(number|bigint)} args - Up to 6 arguments to pass to the function.
     * @returns {Promise<bigint>} Result of the RPC call as a 64‑bit unsigned integer.
     */
    async call(pid, rpcstub, address, ...args) {
        this.checkConnected();

        // Build and send 12‑byte CMD header
        const header = Buffer.alloc(12);
        header.writeUInt32LE(Utils.CMDS.CMD_PACKET_MAGIC, 0);
        header.writeUInt32LE(Utils.CMDS.CMD_PROC_CALL, 4);
        header.writeUInt32LE(Utils.CMDS.CMD_PROC_CALL_PACKET_SIZE, 8);
        await Utils.sendData(this.socket, header);

        // Build 68‑byte payload
        const payload = Buffer.alloc(68);
        let offset = 0;
        payload.writeInt32LE(pid, offset);
        offset += 4;
        payload.writeBigUInt64LE(BigInt(rpcstub), offset);
        offset += 8;
        payload.writeBigUInt64LE(BigInt(address), offset);
        offset += 8;

        if (args.length > 6) throw new Error("libdbg: too many arguments");
        args.forEach(a => {
            payload.writeBigUInt64LE(BigInt(a), offset);
            offset += 8;
        });
        for (let i = args.length; i < 6; i++, offset += 8) payload.writeBigUInt64LE(0n, offset);

        await Utils.sendData(this.socket, payload);
        await Utils.CheckStatus(this.socket);

        const response = await Utils.receiveData(this.socket, 12);
        return response.readBigUInt64LE(4);
    }

    /**
     * Find a process by name.
     *
     * @param {string} name - The name of the process to search for.
     * @param {boolean} [exact=false] - If true, requires an exact match; otherwise performs a case-insensitive substring search.
     * @returns {Promise<object|undefined>} The matching process object, or undefined if not found.
     */
    async findProcess(name, exact = false) {
        const {
            processArray
        } = await this.getProcessList();
        return processArray.find(p =>
            exact ? p.name === name : p.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    /**
     * Find a specific entry in process maps.
     *
     * @param {number} pid - The process ID to search within.
     * @param {string} entryName - The name of the memory entry to search for.
     * @param {boolean} [contains=false] - If true, matches entries containing the name; otherwise requires an exact match.
     * @returns {Promise<object|null>} The matching entry object, or null if not found.
     */
    async findMapEntry(pid, entryName, contains = false) {
        const {
            entries
        } = await this.getProcessMaps(pid);
        return entries.find(e =>
            contains ? e.name.includes(entryName) : e.name === entryName
        ) || null;
    }
}

module.exports = PS4Debug;