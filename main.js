import { open, writeFile } from 'node:fs/promises';

// 512 bytes on disk
// loaded at 0x7c00

let ctors;
let rev16,rev32;
let save2file;
let mkos;
let file;

// this helper will reverse bytes for 16-bit little endian
rev16 = val => {
    return String.fromCharCode(val&0xff)+
           String.fromCharCode((val>>8)&0xff);
}
// this helper will reverse bytes for 32-bit little endian
rev32 = val => {
    return String.fromCharCode(val&0xff)+
           String.fromCharCode((val>>8)&0xff)+
           String.fromCharCode((val>>16)&0xff)+
           String.fromCharCode((val>>24)&0xff);
}

// GDT
// for it we need a null descriptor, code descriptor, and data descriptor
// each entry is 8 bytes.

// 1. null descriptor
const gdtnull = "\x00".repeat(8);
// 2. code descriptor (Base=0,Limit=4GB,Exec/Read,32-bit,4K gran)
// access: 0x9a (Present,Ring0,Code,Exec/Read)
// flags: 0xcf (4k gran,32-bit)
const gdtcode = "\xff\xff\x00\x00\x00\x9a\xcf\x00";
// 3. data descriptor (Base=0,Limit=4GB,Read/Write)
// access: 0x92 (Present,Ring0,Data,Read/Write)
// flags: 0xcf
const gdtdata = "\xff\xff\x00\x00\x00\x92\xcf\x00";

// complete gdt table
const GDT = gdtnull+gdtcode+gdtdata;
const GDTLEN = GDT.length;

// memory offsets
// bootloader loads at 0x7c00
const OFFSETBOOT = 0x7c00;
// we will place gdt data at the end of the boot sector
const OFFSETGDT = OFFSETBOOT+400;
// gdt pointer structure (6 bytes needed for lgdt instruction)
// [limit (2bytes)] [base address (4bytes)]
const GDTR = rev16(GDTLEN-1)+rev32(OFFSETGDT);


ctors = {
    cli: () => "\xfa",
    xorax: () => "\x31\xc0",
    movdsax: () => "\x8e\xd8",
    movesax: () => "\x8e\xc0",
    movssax: () => "\x8e\xd0",
    movspstack: () => "\xbc\x00\x7c",
    // load gdt: opcode 0f 01 16 + 16-bit address of the gdtr struct
    // we place the gdtr struct immediately after the gdt table
    lgdt: () => "\x0f\x01\x16"+rev16(OFFSETGDT+GDTLEN),
    // switch to protected mode
    // 1. load cr0 to eax
    moveaxcr0: () => "\x0f\x20\xc0",
    // 2. set bit 0 (PE) to 1
    oral1: () => "\x0c\x01",
    // 3. write eax back to cr0
    movcr0eax: () => "\x0f\x22\xc0",
    // far jump to flush pipeline
    // jmp 0x08:OFFSET (0x08 is the code segment selector in the gdt)
    // ea <offset16> <segment16>
    // we calculate the offset of 'pm_entry' manually
    // real mode code size is approx 30 bytes, so lets jump to 0x7c00+64(0x40) to be safe
    jmpfarpm: () => "\xea"+rev16(OFFSETBOOT+0x40)+rev16(0x08),
    // now 32 bit instrs
    pmmovaxdata: () => "\x66\xb8\x10\x00", // 0x66 is the prefix for 16 bit reg in 32 bit mode context, or just mov ax
    // actually in 32 bit mode, "MOV AX, 0x10" is "\x66\xb8\x10\x00"
    // but segment registers are 16 bit.
    // lets standard 32 bit opcodes
    pminitsegments: () => 
        "\xb8\x10\x00\x00\x00" +        // MOV EAX, 0x10
        "\x8e\xd8" +                    // MOV DS, AX
        "\x8e\xc0" +                    // MOV ES, AX
        "\x8e\xd0" +                    // MOV SS, AX
        "\x8e\xe0" +                    // MOV FS, AX
        "\x8e\xe8",                     // MOV GS, AX
    
    // print string to 0xb8000
    // edi = 0xb8000
    pmmovedividmem: () => "\xbf\x00\x80\x0b\x00",

    // write char and color at [edi]
    // mov byte [edi], char -> increment edi -> mov byte [edi], color -> increment
    pmprintchar: (char,color) =>
        "\xc6\x07"+String.fromCharCode(char.charCodeAt(0))+// mov [edi], char
        "\x47" +                                           // inc edi
        "\xc6\x07"+String.fromCharCode(color)+             // mov [edi], color
        "\x47",                                            // inc edi

    halt: () => "\xf4",
    loopforever: () => "\xeb\xfe",
    padding: amt => "\x00".repeat(amt),
    magic: () => "\x55\xaa",
};

mkos = msg => {
    const rmc = 
        ctors.cli() +
        ctors.xorax() +
        ctors.movdsax() +
        ctors.movesax() + 
        ctors.movssax() +
        ctors.movspstack() +
        ctors.lgdt() +
        ctors.moveaxcr0() +
        ctors.oral1() +
        ctors.movcr0eax() +
        ctors.jmpfarpm(); // this jumps to offset 0x40 (decimal 64) relative to boot
    
    // padding to ensure protected mode code starts exactly where the far jump lands
    // we targeted 0x40 (64 bytes)
    const currentLen = rmc.length;
    const paddingtopm = ctors.padding(0x40-currentLen);

    let pmcode =
        ctors.pminitsegments() +
        ctors.pmmovedividmem();
    
    // loop through message and generate print instructions
    // color 0x0f = white text on black background, 0x1f = white on blue
    msg.split('').forEach(char => {
        pmcode += ctors.pmprintchar(char,0x1f);
    });

    pmcode += ctors.halt()+ctors.loopforever();

    // we decided gdt goes at offset 400
    const codetotallen = 0x40+pmcode.length; // 64+pm_len
    const paddingtogdt = ctors.padding(400-codetotallen);

    const datasection = GDT+GDTR;

    const finallen = 400+datasection.length;
    const paddingfinal = ctors.padding(510-finallen);

    return rmc+
        paddingtopm+
        pmcode+
        paddingtogdt+
        datasection+
        paddingfinal+
        ctors.magic();
}

save2file = async (msg,filename) => {
    let fd;
    let buf;

    fd = await open(filename,'w',0o644);
    if (!fd)
        throw new Error('Unable to open file');

    // convert string to buffer for raw binary writing
    const bs = mkos(msg);
    buf = Buffer.from(bs,'binary');

    await writeFile(fd,buf);
    fd.close();
    return true;
}

file = process.argv[2];
if (!file) {
    console.error('Usage: ' + process.argv[1] + ' <filename>');
    process.exit(1);
}

// NOTE: Message must be short to fit in sector
let exitval = await save2file("Protected Mode!", file); 

if (exitval) console.log('Runnable file generated succesfully!');
else console.error('Failed.');