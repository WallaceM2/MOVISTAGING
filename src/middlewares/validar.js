// Middleware genérico de validação Zod para corpo e parâmetros.
function formatIssues(issues) {
  return issues.map((issue) => ({
    campo: issue.path.join('.'),
    mensagem: issue.message,
  }));
}

function validar(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      return res.status(400).json({
        erro: 'Dados inválidos.',
        detalhes: formatIssues(resultado.error.issues),
        request_id: req.requestId,
      });
    }
    req.body = resultado.data;
    return next();
  };
}

function validarParams(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.params);
    if (!resultado.success) {
      return res.status(400).json({
        erro: 'Parâmetros inválidos.',
        detalhes: formatIssues(resultado.error.issues),
        request_id: req.requestId,
      });
    }
    req.params = resultado.data;
    return next();
  };
}

module.exports = validar;
module.exports.validarParams = validarParams;
