class Utils {
    constructor() {
        this.CMDS = {
            CMD_PACKET_MAGIC: 0xFFAABBCC,

            // Process commands
            CMD_PROC_LIST: 0xBDAA0001,
            CMD_PROC_READ: 0xBDAA0002,
            CMD_PROC_WRITE: 0xBDAA0003,
            CMD_PROC_MAPS: 0xBDAA0004,
            CMD_PROC_INSTALL: 0xBDAA0005,
            CMD_PROC_CALL: 0xBDAA0006,
            CMD_PROC_ELF: 0xBDAA0007,
            CMD_PROC_PROTECT: 0xBDAA0008,
            CMD_PROC_SCAN: 0xBDAA0009,
            CMD_PROC_INFO: 0xBDAA000A,
            CMD_PROC_ALLOC: 0xBDAA000B,
            CMD_PROC_FREE: 0xBDAA000C,

            // Console commands
            CMD_CONSOLE_REBOOT: 0xBDDD0001,
            CMD_CONSOLE_END: 0xBDDD0002,
            CMD_CONSOLE_PRINT: 0xBDDD0003,
            CMD_CONSOLE_NOTIFY: 0xBDDD0004,
            CMD_CONSOLE_INFO: 0xBDDD0005,

            CMD_SUCCESS: 0x80000000,

            // Sizes
            CMD_PROC_MAPS_PACKET_SIZE: 4,
            CMD_PROC_READ_PACKET_SIZE: 16,
            CMD_PROC_WRITE_PACKET_SIZE: 16,
            CMD_PROC_INSTALL_PACKET_SIZE: 4,
            CMD_PROC_CALL_PACKET_SIZE: 68,
            CMD_PROC_ALLOC_PACKET_SIZE: 8,
            CMD_PROC_FREE_PACKET_SIZE: 16,
            CMD_PROC_ELF_PACKET_SIZE: 8,
            CMD_PROC_PRX_LIST_PACKET_SIZE: 4,
            CMD_CONSOLE_NOTIFY_PACKET_SIZE: 8,

            PROC_LIST_ENTRY_SIZE: 36,
            PROC_MAP_ENTRY_SIZE: 58,
            PROC_PRX_LIST_ENTRY_SIZE: 284,
            PROC_INSTALL_SIZE: 8,
            PROC_ALLOC_SIZE: 8,
            PROC_ELF_SIZE: 8,

            CMD_PACKET_SIZE: 12,
            NET_MAX_LENGTH: 8192
        };
    }

    /**
     * Send data to the PS4 socket in chunks.
     *
     * @param {net.Socket} socket - The target socket to send data through.
     * @param {Buffer} data - The data buffer to send.
     * @returns {Promise<void>} Resolves when all data has been written.
     */
    async sendData(socket, data) {
        for (let offset = 0; offset < data.length;) {
            const size = Math.min(this.CMDS.NET_MAX_LENGTH, data.length - offset);
            const chunk = data.subarray(offset, offset + size);
            await socket.write(chunk);
            offset += size;
        }
    }

    /**
     * Send a command packet to the PS4 socket.
     *
     * @param {net.Socket} socket - The target socket.
     * @param {number} cmd - Command ID.
     * @param {number} length - Payload length.
     * @param {Array<number|bigint|Buffer>} [fields=[]] - Optional payload fields.
     */
    async sendCMDPacket(socket, cmd, length, fields = []) {
        const header = Buffer.alloc(this.CMDS.CMD_PACKET_SIZE);
        header.writeUInt32LE(this.CMDS.CMD_PACKET_MAGIC, 0);
        header.writeUInt32LE(cmd, 4);
        header.writeUInt32LE(length, 8);
        await this.sendData(socket, header);

        if (length > 0 && fields.length) {
            const payload = Buffer.alloc(length);
            let offset = 0;

            for (const field of fields) {
                let bytes;
                if (typeof field === 'number') {
                    // Determine if we need 4 or 8 bytes based on the field value
                    if (field > 0xFFFFFFFF || field < -0xFFFFFFFF) {
                        bytes = Buffer.alloc(8);
                        bytes.writeBigInt64LE(BigInt(field));
                    } else {
                        bytes = Buffer.alloc(4);
                        bytes.writeInt32LE(field);
                    }
                } else if (typeof field === 'bigint') {
                    bytes = Buffer.alloc(8);
                    bytes.writeBigUInt64LE(field);
                } else if (Buffer.isBuffer(field)) {
                    bytes = field;
                }

                if (bytes && offset + bytes.length <= payload.length) {
                    bytes.copy(payload, offset);
                    offset += bytes.length;
                }
            }
            await this.sendData(socket, payload);
        }
    }

    /**
     * Receive data from the PS4 socket in chunks until the requested length is filled.
     *
     * @param {net.Socket} socket - The socket to read from.
     * @param {number} length - Total number of bytes to receive.
     * @returns {Promise<Buffer>} A buffer containing the received data.
     * @throws {Error} If the socket closes before all data is received.
     */
    async receiveData(socket, length) {
        const buffer = Buffer.alloc(length);
        let offset = 0;

        while (offset < length) {
            const chunkSize = Math.min(this.CMDS.NET_MAX_LENGTH, length - offset);
            const chunk = await socket.read(chunkSize);
            if (!chunk) throw new Error("Socket closed while receiving data");
            chunk.copy(buffer, offset);
            offset += chunk.length;
        }

        return buffer;
    }

    /**
     * Check the status response from the PS4 socket.
     *
     * @param {net.Socket} socket - The socket to read from.
     * @returns {Promise<number>} The status code.
     * @throws {Error} If the status is not CMD_SUCCESS.
     */
    async CheckStatus(socket) {
        const statusBuffer = await this.receiveData(socket, 4);
        const status = statusBuffer.readUInt32LE(0);
        if (status !== this.CMDS.CMD_SUCCESS) throw new Error(`libdbg status 0x${status.toString(16)}`);
        return status;
    }

    /**
     * Convert ASCII bytes from a buffer into a string until a null terminator.
     *
     * @param {Buffer} data - The buffer containing ASCII data.
     * @param {number} offset - The starting offset in the buffer.
     * @returns {string} The decoded ASCII string.
     */
    convertASCII(data, offset) {
        const end = data.indexOf(0, offset);
        return data.toString("ascii", offset, end >= 0 ? end : data.length);
    }


    /**
     * Read a typed value from a buffer.
     *
     * @param {Buffer} buffer - The buffer to read from.
     * @param {"UInt64"|"Int32"|"UInt32"} type - The type of value to read.
     * @returns {bigint|number|Buffer} The parsed value.
     */
    getObjectFromBytes(buffer, type) {
        switch (type) {
            case "UInt64":
                return buffer.readBigUInt64LE(0);
            case "Int32":
                return buffer.readInt32LE(0);
            case "UInt32":
                return buffer.readUInt32LE(0);
            default:
                return buffer;
        }
    }

    /**
     * Convert an object into a buffer of bytes.
     *
     * @param {number|bigint|string|Buffer} obj - The object to convert.
     * @param {"UInt64"|"Int32"|string} type - The type of conversion.
     * @returns {Buffer} The resulting buffer.
     */
    getBytesFromObject(obj, type) {
        switch (type) {
            case "UInt64": {
                const b = Buffer.alloc(8);
                b.writeBigUInt64LE(BigInt(obj));
                return b;
            }
            case "Int32": {
                const b = Buffer.alloc(4);
                b.writeInt32LE(obj);
                return b;
            }
            default:
                return Buffer.from(obj);
        }
    }

    /**
     * Convert an array of values into a concatenated buffer.
     *
     * @param {Array<number|bigint|Buffer|string>} fields - The values to convert.
     * @returns {Buffer} Concatenated buffer of all fields.
     */
    convertFieldsToBytes(fields) {
        const buffers = fields.map(field => {
            if (typeof field === "number") {
                const b = Buffer.alloc(4);
                Number.isInteger(field) ? b.writeInt32LE(field) : b.writeFloatLE(field);
                return b;
            }
            if (typeof field === "bigint") {
                const b = Buffer.alloc(8);
                b.writeBigUInt64LE(field);
                return b;
            }
            if (Buffer.isBuffer(field)) return field;
            if (typeof field === "string") return Buffer.from(field, "ascii");
            return Buffer.alloc(0);
        });
        return Buffer.concat(buffers);
    }

}

module.exports = new Utils();