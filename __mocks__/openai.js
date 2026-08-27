/**
 * Mock determinista del SDK 'openai' para tests.
 *
 * Permite a cada test fijar la próxima respuesta (string que será el
 * `choices[0].message.content`) y leer la última llamada (modelo, mensajes,
 * etc.) para verificar que mandamos el System Prompt correcto y el archivo.
 */

let nextResponseContent = null;
let nextResponseError = null;
const calls = [];

const DEFAULT_VALID_PASSPORT = JSON.stringify({
  nombre: 'JUAN',
  apellidos: 'GARCIA LOPEZ',
  numero_pasaporte: 'AAB123456',
  nacionalidad: 'ESP',
  fecha_nacimiento: '1990-01-01',
  fecha_caducidad: '2030-01-01',
  genero: 'M',
});

class OpenAI {
  constructor(opts) {
    this.opts = opts;
  }

  get chat() {
    return {
      completions: {
        create: async (params) => {
          calls.push(params);
          if (nextResponseError) {
            const err = nextResponseError;
            nextResponseError = null;
            throw err;
          }
          const content = nextResponseContent ?? DEFAULT_VALID_PASSPORT;
          nextResponseContent = null;
          return {
            choices: [{ message: { content } }],
          };
        },
      },
    };
  }
}

OpenAI.__setNextResponse = (content) => {
  nextResponseContent = typeof content === 'string' ? content : JSON.stringify(content);
};

OpenAI.__setNextError = (err) => {
  nextResponseError = err instanceof Error ? err : new Error(String(err));
};

OpenAI.__getCalls = () => calls.slice();
OpenAI.__getLastCall = () => calls[calls.length - 1] || null;
OpenAI.__reset = () => {
  nextResponseContent = null;
  nextResponseError = null;
  calls.length = 0;
};

module.exports = OpenAI;
module.exports.default = OpenAI;
module.exports.OpenAI = OpenAI;
