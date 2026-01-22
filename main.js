/* main.js */
// this file will be entry point of the project cuz im lazy
import { open, writeFile } from 'node:fs/promises';
import { ops, rev16, rev32 } from './asm.js';
import { kernel } from './kernel.js';

const BOOTADDR = 0x7c00;
const KERNELADDR = 0x1000;

const bootloader = () => {
    // define gdt
    const gdtnull = "\x00".repeat(8);
    const gdtcode = "\xff\xff\x00\x00\x00\x9a\xcf\x00";
    const gdtdata = "\xff\xff\x00\x00\x00\x92\xcf\x00";
    const GDT = gdtnull+gdtcode+gdtdata;
    const OFFSETGDT = BOOTADDR+400;
    const GDTR = rev16(GDT.length-1)+rev32(OFFSETGDT);

    const realmode =
        ops.cli()+
        ops.xorax()+
        ops.movdsax()+ops.movesax()+ops.movssax()+
        ops.movsp(BOOTADDR)+
        // load 10 sectors to KERNELADDR
        ops.loadsectors(KERNELADDR,10)+
        // disable interrupts again just in case BIOS enabled them
        ops.cli()+
        ops.lgdt(OFFSETGDT+GDT.length)+
        ops.moveaxcr0()+
        ops.oreax1()+
        ops.movcr0eax()+
        ops.jmpfar(BOOTADDR+0x60,0x08);

    const paddingtopm = ops.padding(0x60-realmode.length);

    const pmmode =
        ops.pminitsegments()+
        ops.pmjmpabs(KERNELADDR);
    
    const code = realmode+paddingtopm+pmmode;
    const padtogdt = ops.padding(400-code.length);
    const _gdtdata = GDT+GDTR;
    const finalpad = ops.padding(510-(400+_gdtdata.length));

    return code+padtogdt+_gdtdata+finalpad+ops.magic();
};

const build = async() => {
    console.log("building...");

    const bootbin = Buffer.from(bootloader(),'binary');
    if(bootbin.length!==512) throw new Error("Bootloader must be 512 bytes");
    const kernelbin = Buffer.from(kernel(),'binary');
    console.log(`Kernel size: ${kernelbin.length} bytes`);

    const fd = await open('image.bin','w',0o644);
    await writeFile(fd,bootbin);
    await writeFile(fd,kernelbin);
    await writeFile(fd,Buffer.alloc(10*1024,0));

    fd.close();
    console.log("build complete");
    
};

build().catch(console.error);
