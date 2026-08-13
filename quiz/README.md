# Banco de questões portátil

Este diretório é a fonte neutra em relação a candidatos para os quizzes do workshop. Ele não está
embutido no Slidev. Um host de quiz ao vivo continua fora de escopo (US-QUIZ-3) até um runtime
FOSS passar no license gate.

- `questions.schema.json` documenta a versão 1 do schema.
- `questions.json` é o banco revisado: pelo menos duas questões por seção escrita
  (canônicas e opcionais). O `S24`, em status deferred, fica excluído até a seção ser ensinável.
- IDs estáveis de questão e de opção sobrevivem ao export, de modo que os dados de resultado possam ser relacionados ao conteúdo do currículo.
- Respostas corretas, explicações, justificativas dos distratores, objetivos de aprendizagem e referências de atualidade
  vivem no repositório, e não no banco de dados de um fornecedor de quiz.

Rode os gates do banco e o fallback offline com:

```sh
node scripts/quiz/validate.mjs
node --test scripts/quiz/quiz.test.mjs
node scripts/quiz/license-gate.mjs docs/decisions/evidence/0011-live-quiz-spike/candidates.json
node scripts/quiz/export.mjs --out dist-quiz
node scripts/quiz/rehearse-offline.mjs --out dist-quiz --timestamp 2026-08-04T00:06:23+02:00
```

O AJV impõe o `questions.schema.json`; o validador então aplica as relações semânticas que o JSON Schema
não expressa, incluindo pertencimento a seções conhecidas, IDs únicos, referências de resposta para opção e um
gate de cobertura de pelo menos duas questões por seção escrita.

O comando de export cria Markdown separado de participante e de facilitador, mais uma prévia de adapter
não destinada a produção. A saída do participante omite as respostas de propósito. A saída do facilitador pode ser impressa ou usada
como fallback de contagem por mãos levantadas quando um serviço ao vivo ou a internet do local não estiverem disponíveis.

O comando de rehearsal reexecuta a validação e o export, registra hashes de entrada/saída, verifica a separação de reveal
e confere o reset offline determinístico. Um exemplo commitado do spike US-QUIZ-1 vive no diretório de
evidências dos ADRs. Ele não exercita nem faz afirmações sobre um serviço de quiz ao vivo.

A prévia de adapter registra o que uma integração eventual precisaria; ela não faz upload de questões nem
alega compatibilidade de API. O Claper não tem API estável documentada de bulk-import no commit avaliado, o
ClassQuiz importa o formato de arquivo nativo autenticado dele, e o QuizDock expõe criação REST autenticada
via OpenAPI. O schema neste diretório continua sendo a fonte da verdade independentemente do adapter
de entrega eventual.
