# Protótipo de quiz portátil

Este diretório é a fonte neutra em relação aos candidatos para o spike de arquitetura US-QUIZ-1. Não é um
banco de questões completo e não está embutido no Slidev.

- `questions.schema.json` documenta a versão 1 do schema.
- `questions.prototype.json` exercita o schema nas seções S05, S07 e S09.
- IDs estáveis de questão e de opção sobrevivem ao export, de modo que os dados de resultado possam ser relacionados ao conteúdo do currículo.
- Respostas corretas, explicações, justificativas dos distratores, objetivos de aprendizagem e referências de atualidade
  vivem no repositório, e não no banco de dados de um fornecedor de quiz.

Execute os gates do protótipo e o fallback offline com:

```sh
node scripts/quiz/validate.mjs
node --test scripts/quiz/quiz.test.mjs
node scripts/quiz/license-gate.mjs docs/decisions/evidence/0011-live-quiz-spike/candidates.json
node scripts/quiz/export.mjs --out dist-quiz
node scripts/quiz/rehearse-offline.mjs --out dist-quiz --timestamp 2026-08-04T00:06:23+02:00
```

O AJV aplica `questions.schema.json`; em seguida o validador aplica as relações semânticas que o JSON Schema
não expressa, incluindo pertencimento às seções canônicas, IDs únicos e referências de resposta para opção.

O comando de export cria arquivos Markdown separados para participante e facilitador, além de uma prévia
do adapter não destinada a produção. A saída do participante omite as respostas deliberadamente. A saída do facilitador pode ser impressa ou usada
como fallback de votação por mãos levantadas quando o serviço ao vivo ou a internet do local não estiverem disponíveis.

O comando de ensaio repete a validação e o export, registra os hashes de entrada/saída, verifica a separação do reveal
e confirma o reset offline determinístico. Um exemplo commitado vive no diretório de evidências do ADR. Ele não
exercita nem faz afirmações sobre um serviço de quiz ao vivo.

A prévia do adapter registra o que uma eventual integração precisaria; ela não faz upload de questões nem
afirma compatibilidade de API. O Claper não tem uma API de bulk-import estável e documentada no commit avaliado,
o ClassQuiz importa o formato de arquivo nativo autenticado dele próprio, e o QuizDock expõe criação via REST
autenticada por OpenAPI. O US-QUIZ-2 deve manter este schema como fonte da verdade, independentemente do adapter
de entrega escolhido.
