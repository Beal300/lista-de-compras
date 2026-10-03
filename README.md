# Lista de Compras Inteligente

Lista de compras compartilhada para uso doméstico em computadores e celulares. Um computador mantém o servidor ligado e os dispositivos acessam a mesma lista pela rede local.

## Funcionalidades

- Catálogo por categorias, com busca, ordenação, cadastro, edição, arquivamento e restauração.
- Seleção de produtos, ajuste de quantidades e marcação dos itens no carrinho.
- Adição rápida e cadastro de produtos durante a compra.
- Finalização com valor opcional e opção de levar pendentes para a próxima lista.
- Histórico de compras, edição de valores e exclusão com confirmação.
- Consulta e vínculo de NFC-e da SEFA/PR, com prévia e confirmação de substituição quando o total diverge do valor informado.
- Sincronização entre dispositivos, temas claro/escuro e layout adaptável a celulares, tablets e desktops.

## Arquitetura

React e TypeScript compõem a interface; Express serve a API e a interface compilada. SQLite é a fonte central dos dados. O navegador consulta atualizações periodicamente, e o servidor valida alterações para evitar sobrescritas silenciosas em caso de conflito.

O acesso usa uma senha compartilhada. Não há contas individuais: todos os dispositivos autorizados podem editar os mesmos dados.

## Requisitos

- Node.js 22.12 ou superior e npm.
- Um computador com armazenamento local e acesso à rede doméstica.
- Internet para instalar as dependências e consultar NFC-e; o uso da lista depende apenas da conexão com o servidor.

## Instalação

Na pasta do projeto:

```sh
npm ci
npm run build
```

## Configuração

```sh
npm run setup
```

Defina uma senha de 12 a 256 caracteres no terminal. A entrada fica oculta, e o banco armazena um verificador, não a senha em texto. A primeira configuração cria o catálogo inicial e uma lista vazia; executá-la novamente preserva os dados existentes.

Para personalizar o servidor, copie `.env.example` para `.env`. A senha é configurada pelo comando acima, nunca no arquivo de ambiente.

| Variável | Padrão | Finalidade |
|---|---|---|
| `PORT` | `3000` | Porta da aplicação |
| `HOST` | `0.0.0.0` | Interface de escuta; `127.0.0.1` restringe ao computador |
| `DATA_DIR` | `data` | Pasta do banco |
| `BACKUP_DIR` | `backups` | Pasta de backups |
| `ALLOWED_ORIGINS` | localhost e IPv4 locais na porta configurada | Origens permitidas, separadas por vírgulas |
| `COOKIE_SECURE` | `false` | Restringe cookies a HTTPS quando `true` |

Os caminhos são relativos à pasta de execução. Reinicie o servidor após alterar a configuração. Banco e backups devem permanecer fora da pasta pública `dist`.

## Execução

```sh
npm start
```

Abra `http://localhost:3000` e informe a senha. No Windows, também é possível abrir `iniciar.cmd` após a instalação e o build. Mantenha a janela aberta; use Ctrl+C para encerrar.

A sessão permanece por até 30 dias. **Sair** encerra a sessão daquele navegador. Para trocar a senha, encerre o servidor, execute `npm run password` e inicie novamente; isso encerra todas as sessões sem apagar as compras.

Após atualizar o código, encerre o servidor, execute `npm ci` e `npm run build`, e inicie novamente. O build não apaga o banco.

## Acesso pela rede local

1. Conecte o computador e os celulares à mesma rede.
2. Localize o IPv4 do computador (`ipconfig` no Windows) ou use o endereço mostrado pelo servidor.
3. No celular, abra `http://IP-DO-COMPUTADOR:3000` e informe a senha. `localhost` no celular aponta para o próprio aparelho.

Permita o Node.js no Firewall do Windows apenas em redes privadas, restringindo o acesso à porta configurada e à rede local. Não desative o firewall nem redirecione portas do roteador. Redes de convidados podem impedir a comunicação entre dispositivos.

**HTTP não criptografa senha, cookies ou dados em trânsito.** Use somente uma rede confiável. A aplicação não está configurada para exposição direta à internet. O computador servidor precisa permanecer ligado e sem suspensão.

## Backup e restauração

O banco padrão é `data/shopping.sqlite`. Ele contém compras, notas fiscais, configuração de acesso e sessões. Banco e backups são privados e devem ficar fora do Git.

Para gerar um backup consistente, inclusive com o servidor em uso:

```sh
npm run backup
```

O arquivo é criado em `backups`. Mantenha uma cópia em outro disco. Não copie apenas o SQLite principal enquanto estiver aberto, pois pode haver dados nos arquivos auxiliares. Não mantenha o banco ativo em uma pasta de rede ou sincronização de arquivos.

Para restaurar:

1. Encerre o servidor.
2. Execute `npm run restore -- "backups/ARQUIVO-DO-BACKUP.sqlite"`.
3. Confira o aviso e digite `RESTAURAR`.
4. Execute `npm start` e entre com a senha do backup.

A restauração valida o arquivo, preserva um backup da base atual e remove sessões antigas. As notas fiscais fazem parte dos backups; bases anteriores compatíveis são migradas ao abrir o servidor.

Dados da antiga versão local podem ser baixados pelo botão **Exportar dados locais antigos (JSON)**, no navegador e endereço originais. A exportação não altera os dados nem os importa para a base compartilhada; guarde-a fora do repositório ou em `backups`.

## Testes e desenvolvimento

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes usam bancos temporários e servidores isolados, sem acessar a base real. As consultas de NFC-e são simuladas com uma fixture inteiramente fictícia. A suíte de navegador cobre compras, sincronização, autenticação, histórico, temas e responsividade.

Para desenvolvimento, configure `ALLOWED_ORIGINS` com as origens da API e do Vite conforme `.env.example`. Execute `npm run dev:server` e `npm run dev` em terminais separados. O proxy do Vite usa a porta 3000 para a API; ajuste `vite.config.ts` se mudar essa porta.

## Estrutura principal

```text
src/app/          Interface e sincronização
src/components/   Componentes reutilizáveis
src/domain/       Modelos, validação e regras de negócio
src/persistence/  Acesso aos dados pelo navegador
src/data/         Catálogo inicial público
server/           API, autenticação, SQLite, NFC-e e backups
scripts/          Compilação do servidor
tests/            Testes de navegador
data/             Banco privado, não versionado
backups/          Backups privados, não versionados
```

## Limitações atuais

- Sem conexão com o servidor, novas gravações ficam bloqueadas; não há fila offline. A sincronização normalmente leva cerca de dois segundos.
- Edições concorrentes podem exigir revisão e reenvio. Quando uma resposta se perde, use **Verificar operação pendente** antes de repetir a ação.
- Quantidades planejadas são inteiras; quantidades fracionárias da nota fiscal são preservadas separadamente.
- Cada compra aceita uma NFC-e. O suporte inicial é ao DANFE HTML da SEFA/PR, sem XML, PDF, CAPTCHA ou outros estados. Mudanças no site podem impedir a leitura. A importação não verifica assinatura digital nem validade fiscal.
- O histórico é adequado ao uso doméstico; não há paginação, identificação individual de autores, serviços de nuvem ou recursos de IA.
