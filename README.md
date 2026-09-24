# Lista de Compras Inteligente

Aplicação pessoal em React, TypeScript e Vite, com persistência local. Não requer backend.

## Executar

Requer Node.js 22.12+ (ou 24 LTS) e npm.

```sh
npm install
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente http://localhost:5173. Para compilar e visualizar a versão de produção:

```sh
npm run build
npm run preview
```

Neste ambiente, o Node está instalado em `C:\Program Files\nodejs`, mas o terminal inicial não o encontrava no PATH. Se isso ocorrer no PowerShell, abra um novo terminal ou execute:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
npm.cmd run dev
```

No primeiro acesso, escolha importar apenas o catálogo (lista vazia) ou também a compra da planilha. O catálogo completo é apresentado para revisão e seleção. Nas visitas seguintes, os dados existentes são carregados sem nova importação.

## Fluxos

- **Minha compra:** revise todo o catálogo por categoria, busque e selecione produtos, ajuste quantidades e marque pendentes/no carrinho.
- **Adição rápida:** adiciona 1 unidade; um produto existente recebe mais 1 e volta para pendente, inclusive se estava no carrinho.
- **Revisão do catálogo:** abre com todos os itens atuais selecionados e suas quantidades. Ao salvar, a seleção substitui os itens da lista ativa: desmarcar remove, selecionar adiciona e ajustar quantidade preserva o estado de carrinho. É possível desmarcar tudo. A busca apenas filtra a exibição, sem perder seleções. Voltar sem salvar descarta a revisão.
- **Finalização:** confirmação com escolha entre transferir apenas os pendentes, preservando suas quantidades, ou começar vazia. A compra original permanece no histórico.
- **Catálogo:** cadastro, edição, mudança de categoria, arquivamento e restauração. Arquivar não remove itens de uma compra já criada.
- **Histórico:** compras concluídas com nomes e quantidades daquele momento, em grupos de produtos comprados e pendentes com contadores. A organização é somente visual e também se aplica às compras já salvas.
- **Aparência:** controle no cabeçalho com Claro, Escuro ou Automático (padrão). O automático acompanha mudanças de preferência do sistema. A escolha fica na chave separada `lista-compras-inteligente-theme`, sem modificar os dados das compras.

## Acesso pelo celular na rede local

Use no celular o endereço `Network` exibido pelo Vite, na mesma rede do computador. A geração de UUID usa `crypto.randomUUID()` quando disponível e UUID v4 com `crypto.getRandomValues()` nos demais casos, incluindo HTTP de rede local. IDs existentes e o formato dos dados persistidos permanecem inalterados.

Na versão inicial, a criação de dados dependia diretamente de `randomUUID`, ausente em HTTP fora de localhost. Isso causava uma exceção ao escolher uma opção de importação, apresentada incorretamente como erro de quantidade pelo tratamento genérico. O erro foi reproduzido nesse contexto e corrigido na geração de IDs. O carregamento por si só não cria listas nem importa o catálogo; apenas lê e valida dados existentes. Agora erros de quantidade, demais validações e falhas técnicas têm mensagens distintas.

## Dados iniciais

O catálogo inicial está em `src/data/seed.json`: 92 produtos, três categorias e 17 produtos com quantidade positiva (44 unidades). Ele foi gerado a partir da planilha original. Neste conjunto inicial, todos os itens positivos têm estado `in_cart`. Quantidade zero nunca vira item da lista.

Nomes foram preservados, removendo somente espaços excedentes. IDs do catálogo inicial derivam de categoria e nome e permanecem fixos no JSON distribuído. Novos registros usam UUID. O JSON é usado somente quando não existem dados persistidos. A aplicação e o build não dependem do CSV; a planilha original não faz parte do repositório.

Para alterar o catálogo inicial de futuras instalações, edite o JSON preservando os IDs existentes. Essa alteração não migra nem sobrescreve dados já salvos; usuários existentes gerenciam seus produtos pela interface. Não há importador genérico de CSV nesta versão.

## Organização

```text
src/app/             Telas, navegação e coordenação das operações
src/components/      Controles visuais compartilhados
src/domain/          Modelos, validação e regras puras de compras/catálogo
src/persistence/     Contrato Repository e implementação localStorage
src/data/            Catálogo inicial gerado
tests/               Cenários de navegador com Playwright
```

O armazenamento usa a chave `lista-compras-inteligente` e um documento com `schemaVersion`, `revision`, `workspaceId`, categorias, produtos, listas e itens. Todas as operações são validadas antes da gravação; a interface só aceita a alteração após salvar. Leitura inválida bloqueia a aplicação sem apagar ou substituir os dados. Mudanças em outra aba bloqueiam gravações desatualizadas (proteção local básica, não sincronização transacional).

Uma versão de esquema desconhecida é rejeitada, sem reset automático. Migrações explícitas deverão ser adicionadas quando o esquema evoluir. Erros de espaço/permissão são apresentados e a última versão salva é preservada.

UUIDs, `workspaceId`, datas, referências e snapshots do histórico preparam a evolução. Um backend futuro deverá implementar um repositório assíncrono e definir autenticação, autorização, exclusões e conflitos; essas funcionalidades não estão implementadas. O contrato atual é síncrono por usar localStorage.

Os dados pertencem ao navegador e à origem (endereço/porta) usados. Limpar o armazenamento remove as compras. Não há backup automático nem sincronização entre dispositivos. Quantidades são inteiras de 1 a 9999, em unidades, como na planilha; não há compras parcialmente colocadas no carrinho.

## Verificações

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Testes de domínio e persistência cobrem importação, seleção, adição rápida, quantidades, estados, finalização nas duas modalidades, histórico, edição/arquivamento, recarga, dados inválidos e conflito entre abas. Também verificam UUIDs sem `randomUUID`, remoção da seleção completa e classificação de erros. Testes de navegador exercitam os fluxos em desktop e viewport móvel, incluindo os três temas, mudanças do sistema, preferências persistidas e histórico existente. O Playwright inicia um servidor Vite na porta 5174, separado da porta habitual de desenvolvimento.

Validação desta atualização: 23 testes de domínio/validação/persistência aprovados; 14 cenários de navegador aprovados em localhost e os mesmos 14 aprovados por HTTP no endereço da rede local (28 execuções). Compilação TypeScript e build de produção aprovados. Capturas do histórico em tema escuro foram inspecionadas em desktop e viewport móvel. O build emite somente avisos de comentários de anotação da dependência Zod, sem impedir a compilação.

Para repetir a validação HTTP no PowerShell, substitua o IP pelo endereço do computador:

```powershell
$env:E2E_BASE_URL = 'http://192.168.1.2:5174'
npm run test:e2e
Remove-Item Env:E2E_BASE_URL
```

Esse cenário verifica explicitamente que o contexto não é seguro e que `randomUUID` está ausente. Os testes usam contextos isolados de navegador e não acessam nem apagam as compras do perfil pessoal.

Fora do escopo: autenticação, sincronização, IA, integrações externas, análise avançada, importação genérica, instalação PWA e funcionamento offline garantido após fechar a aplicação.
