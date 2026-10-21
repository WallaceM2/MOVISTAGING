const multer = require('multer');
const AppError = require('../errors/AppError');

const allowedTypes = new Set(['image/jpeg', 'image/png', 'audio/mp4']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) return callback(new AppError('Envie uma foto JPG/PNG ou um áudio M4A.', 400, 'INVALID_CHAT_MEDIA_TYPE'));
    callback(null, true);
  },
});

function validateChatMediaSignature(req, res, next) {
  try {
    const file = req.file;
    if (!file) return next();
    const buffer = file.buffer;
    const validImage = file.mimetype === 'image/jpeg'
      ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : file.mimetype === 'image/png'
        ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.mimetype === 'audio/mp4'
          && buffer.length >= 12
          && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    if (!validImage) throw new AppError('O conteúdo do arquivo não corresponde ao tipo informado.', 400, 'INVALID_CHAT_MEDIA_CONTENT');
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { upload, validateChatMediaSignature };
