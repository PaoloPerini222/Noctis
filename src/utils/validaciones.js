export const ID_MAXIMO = 2147483647;
export const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Acepta "5" o 5; devuelve el id como número o null si no es un id válido.
export const parseId = (valor) => {
    const texto = String(valor ?? "");
    if(!/^\d+$/.test(texto)){
        return null;
    }

    const id = Number(texto);
    if(id < 1 || id > ID_MAXIMO){
        return null;
    }

    return id;
};

// Texto opcional: devuelve {error} si no es string o supera el máximo, o {valor} (recortado o null).
export const textoOpcional = (valor, campo, maximo) => {
    if(valor === undefined || valor === null){
        return {valor: null};
    }
    if(typeof valor !== "string"){
        return {error: `${campo} no es valido`};
    }

    const limpio = valor.trim();
    if(limpio.length > maximo){
        return {error: `${campo} no puede superar los ${maximo} caracteres`};
    }

    return {valor: limpio || null};
};

// Texto obligatorio: igual que textoOpcional pero exige contenido.
export const textoObligatorio = (valor, campo, maximo) => {
    if(typeof valor !== "string" || !valor.trim()){
        return {error: `${campo} es obligatorio`};
    }

    return textoOpcional(valor, campo, maximo);
};

// Lista de ids sin repetidos: devuelve {error} o {ids}.
export const listaDeIds = (valor, campo) => {
    if(!Array.isArray(valor)){
        return {error: `${campo} debe ser una lista de ids`};
    }

    const ids = [];
    for(const item of valor){
        const id = parseId(item);
        if(id === null){
            return {error: `${campo} contiene un id no valido`};
        }
        if(!ids.includes(id)){
            ids.push(id);
        }
    }

    return {ids};
};
