# Bootloader doc

## Memory Layout

The bootloader assumes the standard BIOS entry point.

| Memory Address | Component | Description |
| :--- | :--- | :--- |
| `0x7C00` | Real Mode Entry | The BIOS loads the sector here. |
| `0x7C40` | PM Entry | Target of the Far Jump after mode switch. |
| `0x7D90` | GDT | The Global Descriptor Table data. |
| `0xB8000` | Video Memory | VGA text mode buffer (Protected Mode). |

## Logic Flow

### 1. Helper Functions
Since x86 is a Little-Endian architecture, multi-byte numbers must be reversed before writing them to the binary buffer.
*   **`rev16(val)`**: Reverses a 16-bit integer (e.g., `0x1234` -> `"\x34\x12"`).
*   **`rev32(val)`**: Reverses a 32-bit integer.

### 2. Global Descriptor Table (GDT)
Protected Mode requires a GDT to define memory segments. The script constructs three descriptors manually:

1.  **Null Descriptor**: 8 bytes of zeros (Required by CPU).
2.  **Code Descriptor**: 
    *   **Selector**: `0x08`
    *   **Base**: `0x0`, **Limit**: `4GB`
    *   **Access**: `0x9A` (Present, Ring 0, Code, Exec/Read).
    *   **Flags**: `0xCF` (32-bit, 4K Granularity).
3.  **Data Descriptor**:
    *   **Selector**: `0x10`
    *   **Base**: `0x0`, **Limit**: `4GB`
    *   **Access**: `0x92` (Present, Ring 0, Data, Read/Write).

### 3. Real Mode (16-bit)
Located at `0x7C00`. The code performs the following steps:
1.  **`CLI`**: Disable interrupts to prevent crashes during the mode switch.
2.  **Segment Init**: Zeros out `AX`, `DS`, `ES`, and `SS`.
3.  **Stack Setup**: Sets the Stack Pointer (`SP`) to `0x7C00` (growing downwards).
4.  **`LGDT`**: Loads the GDT Register using the structure placed at offset 400.
5.  **Enter Protected Mode**: 
    *   Moves `CR0` to `EAX`.
    *   ORs the value with `0x01` (Setting the PE bit).
    *   Moves the result back to `CR0`.
6.  **Far Jump**: Executes `JMP 0x08:0x7C40`. This flushes the CPU pipeline and updates the Code Segment (`CS`) register to the new 32-bit selector.

### 4. Protected Mode (32-bit)
Located at `0x7C40` (Offset 64).
1.  **Segment Init**: Loads `DS`, `ES`, `SS`, `FS`, `GS` with the Data Selector (`0x10`).
2.  **VGA Output**:
    *   Sets `EDI` to `0xB8000` (Video Memory).
    *   Loops through the provided message string.
    *   Writes **Character Byte** followed by **Attribute Byte** (`0x1F`: White text on Blue background) directly to memory.
3.  **Halt**: Executes `HLT` and loops forever (`JMP $`).

## Binary Assembly

The `mkos` function assembles the final 512-byte buffer in this order:

1.  **Real Mode Code**: ~30 bytes.
2.  **Padding 1**: Fills with zeros until offset `0x40` (64).
3.  **Protected Mode Code**: The variable length payload.
4.  **Padding 2**: Fills with zeros until offset `400`.
5.  **GDT Data**: Writes the descriptor table and the GDT pointer structure.
6.  **Final Padding**: Fills with zeros until byte 510.
7.  **Boot Signature**: Writes `0x55 0xAA` at bytes 511-512, marking the disk as bootable.