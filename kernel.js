import { ops } from './asm.js';

export const kernel = () => {
    // screen width is 160 bytes (80 chars * 2 bytes per char)
    const linewidth = 160;
    
    return (
        ops.pmmovedi(0xb8000)+
        ops.pmprint("JSOS KERNEL V1.0",0x0a)+
        ops.pmprint("kernel loaded thats cool",0x0f)+
        ops.pmaddedi(linewidth)+
        ops.hlt()+
        ops.loop()
    );
};