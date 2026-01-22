/* asm.js */

// converters
export const rev16 = val => String.fromCharCode(val&0xff)+String.fromCharCode((val>>8)&0xff);
export const rev32 = val => String.fromCharCode(val&0xff)+String.fromCharCode((val>>8)&0xff)+String.fromCharCode((val>>16)&0xff)+String.fromCharCode((val>>24)&0xff);

// operations
export const ops = {
    cli: () => "\xfa",
    xorax: () => "\x31\xc0",
    movdsax: () => "\x8e\xd8",
    movesax: () => "\x8e\xc0",
    movssax: () => "\x8e\xd0",
    movsp: (addr) => "\xbc"+rev16(addr),
    // BIOS disk read (0x13)
    loadsectors: (targetaddr,sectorcount)=>
        "\xb4\x02"+                                 // mov ah, 0x02
        "\xb0"+String.fromCharCode(sectorcount)+    // mov al, sectorcount
        "\xb5\x00"+                                 // mov ch, 0
        "\xb6\x00"+                                 // mov dh, 0
        "\xb1\x02"+                                 // mov cl, 2
        "\xbb"+rev16(targetaddr)+                   // mov bx, targetaddr
        "\xcd\x13",                                 // int 0x13
    
    lgdt: (gdtroffset) => "\x0f\x01\x16"+rev16(gdtroffset),
    moveaxcr0: () => "\x0f\x20\xc0",
    oreax1: () => "\x0c\x01",
    movcr0eax: () => "\x0f\x22\xc0",
    jmpfar: (offset,segment) => "\xea"+rev16(offset)+rev16(segment),
    pminitsegments: () =>
        "\xb8\x10\x00\x00\x00" + // mov eax, 0x10
        "\x8e\xd8" +             // mov ds, ax
        "\x8e\xc0" +             // mov es, ax
        "\x8e\xd0" +             // mov ss, ax
        "\x8e\xe0" +             // mov fs, ax
        "\x8e\xe8",              // mov gs, ax
    
    pmjmpabs: (addr) => "\xbd"+rev32(addr)+"\xff\xe5",// mov ebp, addr
                                                      // jmp ebp
    pmmovedi: (addr) => "\xbf"+rev32(addr),// mov edi, addr
    pmprint: (str,color) => {
        let code = "";
        for(let i=0; i<str.length; i++) {
            code += "\xc6\x07"+String.fromCharCode(str.charCodeAt(i)); // mov [edi], char
            code += "\x47"; // inc edi
            code += "\xc6\x07"+String.fromCharCode(color); // mov [edi], color
            code += "\x47"; // inc edi
        }
        return code;
    },
    pmaddedi: (val) => "\x81\xc7"+rev32(val),
    hlt: () => "\xf4",
    loop: () => "\xeb\xfe",
    nop: () => "\x90",
    padding: (len) => "\x00".repeat(len>0?len:0),
    magic: () => "\x55\xaa"
};