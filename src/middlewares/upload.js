const multer = require('multer');
const AppError = require('../errors/AppError');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new AppError('Tipo de arquivo não permitido. Envie JPG, PNG ou PDF.', 400, 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 6 },
});

function validateFileSignature(buffer, mimetype) {
  if (!buffer) return false;
  if (mimetype === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mimetype === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  return false;
}

function validarAssinaturaArquivo(req, res, next) {
  try {
    const files = [];
    if (req.file) files.push(req.file);
    if (req.files && !Array.isArray(req.files)) Object.values(req.files).forEach((items) => files.push(...items));
    if (Array.isArray(req.files)) files.push(...req.files);

    for (const file of files) {
      if (!validateFileSignature(file.buffer, file.mimetype)) {
        throw new AppError('Conteúdo do arquivo não corresponde ao tipo declarado.', 400, 'INVALID_FILE_CONTENT');
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = upload;
module.exports.validarAssinaturaArquivo = validarAssinaturaArquivo;
module.exports.validateFileSignature = validateFileSignature;
