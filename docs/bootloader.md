# Bootloader doc

## Memory Layout

The bootloader assumes the standard BIOS entry point, but now acts as a stage-1 loader to fetch the kernel.

| Memory Address | Component | Description |
| :--- | :--- | :--- |
| `0x1000` | Kernel Load Address | Destination where the kernel (sectors 2-11) is loaded. |
| `0x7C00` | Real Mode Entry | The BIOS loads the boot sector here. |
| `0x7C60` | PM Entry | Target of the Far Jump after mode switch (Offset 96). |
| `0x7D90` | GDT | The Global Descriptor Table data (Offset 400). |

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
1.  **`CLI`**: Disable interrupts.
2.  **Segment Init**: Zeros out `AX`, `DS`, `ES`, and `SS`.
3.  **Stack Setup**: Sets the Stack Pointer (`SP`) to `0x7C00`.
4.  **Load Kernel**: 
    *   Uses BIOS Interrupt `0x13`, Function `0x02`.
    *   Reads **10 sectors** starting from Cylinder 0, Head 0, Sector 2.
    *   Writes data to memory address `0x1000`.
5.  **`CLI`**: Disable interrupts again (safety measure).
6.  **`LGDT`**: Loads the GDT Register using the structure placed at offset 400.
7.  **Enter Protected Mode**: 
    *   Moves `CR0` to `EAX`.
    *   ORs the value with `0x01` (Setting the PE bit).
    *   Moves the result back to `CR0`.
8.  **Far Jump**: Executes `JMP 0x08:0x7C60`. This flushes the CPU pipeline and updates `CS` to the 32-bit selector.

### 4. Protected Mode (32-bit)
Located at `0x7C60` (Offset 96).
1.  **Segment Init**: Loads `DS`, `ES`, `SS`, `FS`, `GS` with the Data Selector (`0x10`).
2.  **Kernel Handover**:
    *   Executes an absolute jump to `0x1000` (The location where the kernel was loaded).

## Binary Assembly

The `mkos` function assembles the final 512-byte buffer in this order:

1.  **Real Mode Code**: Instructions for setup and disk reading.
2.  **Padding 1**: Fills with zeros until offset `0x60` (96).
3.  **Protected Mode Stub**: Segment setup and jump to kernel.
4.  **Padding 2**: Fills with zeros until offset `400`.
5.  **GDT Data**: Writes the descriptor table and the GDT pointer structure.
6.  **Final Padding**: Fills with zeros until byte 510.
7.  **Boot Signature**: Writes `0x55 0xAA` at bytes 511-512.