# Lista de Compras Inteligente

Aplicação compartilhada para uso doméstico em computadores e celulares. React e TypeScript no frontend, Express no servidor e SQLite como fonte central dos dados. Um único computador mantém o servidor ligado; os dispositivos acessam a mesma lista pela rede local.

## Primeira configuração

Requer Node.js 22.12 ou superior (recomendado Node.js 24 LTS) e npm.

```sh
npm install
npm run build
npm run setup
npm start
```

O comando `setup` solicita e confirma uma senha compartilhada com pelo menos 12 caracteres. A entrada fica oculta no terminal. Não passe a senha na linha de comando nem a coloque no código ou no frontend. O servidor armazena somente um verificador com salt e scrypt no banco SQLite.

A primeira configuração cria **92 produtos, três categorias e uma lista vazia**, usando `src/data/seed.json`. Quantidades e marcações da planilha anterior são ignoradas. Reiniciar ou executar setup novamente não duplica produtos nem sobrescreve dados existentes. Formatos desconhecidos ou dados inválidos interrompem a operação, sem reset automático.

No computador, abra **http://localhost:3000**. Digite a senha compartilhada na interface. A sessão dura 30 dias e permanece entre acessos e reinícios normais do servidor. O botão Sair encerra a sessão daquele navegador.

Para alterar a senha, encerre o servidor e execute:

```sh
npm run password
npm start
```

A alteração de senha encerra todas as sessões, preservando catálogo, listas e histórico.

## Uso diário no Windows

Depois de instalar, compilar e configurar, execute apenas `npm start` ou abra **iniciar.cmd** com duplo clique. O arquivo verifica a configuração antes de iniciar. A mesma instância Node serve a interface compilada e a API. A janela precisa permanecer aberta; use Ctrl+C para encerrar.

Mantenha o computador ligado, conectado à rede e sem suspensão durante o uso. Depois de atualizar o código, encerre o servidor, execute `npm install` e `npm run build`, e inicie novamente. A pasta de dados não é apagada pelo build.

### Acesso pelos celulares

1. Conecte o computador e os celulares à mesma rede doméstica.
2. Execute `ipconfig` no Windows e localize o Endereço IPv4 do adaptador em uso, ou utilize um dos endereços exibidos pelo servidor.
3. No celular, abra `http://IP-DO-COMPUTADOR:3000`. No celular, localhost significa o próprio celular, não o computador servidor.
4. Informe a mesma senha compartilhada.

No Firewall do Windows, permita o Node.js apenas para redes **Privadas**. Caso configure uma regra de entrada, restrinja-a à porta TCP usada pelo servidor (3000 por padrão), ao perfil Privado e à sub-rede local. Não desative o firewall nem abra portas no roteador. Redes Wi-Fi de convidados podem bloquear comunicação entre dispositivos.

Uma reserva de DHCP no roteador pode manter o IP do computador estável. Caso ele mude, reinicie o servidor e atualize o endereço nos aparelhos.

## Funcionalidades

- Catálogo completo por categoria, busca, cadastro, edição, mudança de categoria, arquivamento e restauração.
- Revisão da lista com itens atuais selecionados e suas quantidades. Salvar inclui selecionados, remove desmarcados e preserva o estado de carrinho dos itens mantidos.
- Adição rápida: +1 unidade; itens existentes voltam para pendente. Incrementos simultâneos válidos são somados pelo servidor.
- Quantidades inteiras de 1 a 9999, pendentes e itens no carrinho.
- Finalização com transferência dos pendentes ou início de uma lista vazia. O histórico original é preservado.
- Histórico separado entre produtos comprados e pendentes, com quantidades e nomes daquele momento.
- Temas claro, escuro e automático, com preferência local de cada navegador.
- Exportação JSON dos dados antigos do localStorage, sem importar nem apagar esses dados.

## Sincronização e conflitos

A interface consulta a API a cada dois segundos enquanto estiver visível e ao retornar à página. ETags evitam transferir novamente o estado quando não há mudanças. Os indicadores são Conectado, Reconectando e Sem conexão.

O navegador envia comandos, nunca uma cópia integral do estado para substituir o banco. Cada comando possui ID único e revisão esperada. O servidor valida, executa e grava estado e recibo na mesma transação SQLite.

- Incrementos de adição rápida podem usar a quantidade mais recente da mesma lista ativa.
- Quantidade absoluta, remoção, edição de produto, arquivamento, revisão e finalização exigem a revisão atual. Se outra pessoa alterou os dados, a operação é rejeitada com uma mensagem; não há sobrescrita silenciosa.
- Revisões de catálogo, formulários e quantidades em digitação mantêm sua base de edição. Em caso de conflito, revise os dados atuais e reabra o formulário ou a revisão antes de reenviar.
- Uma finalização conclui a lista e cria a próxima em uma única transação. Comandos da lista anterior não atingem a nova.
- Uma requisição repetida com o mesmo ID não reaplica seus efeitos, inclusive após reinício do servidor.

Quando uma resposta de gravação se perde, a interface oferece **Verificar operação pendente**, repetindo o mesmo comando com o mesmo ID. Não feche a página antes de confirmar esse resultado. Alterações não são apresentadas como salvas antes da confirmação. Sem conexão, a visualização já carregada permanece disponível e novas gravações ficam bloqueadas. Não há fila offline nem uso silencioso do localStorage como banco alternativo.

## Dados locais anteriores

A base compartilhada começa nova. A chave antiga `lista-compras-inteligente` do localStorage permanece intacta, mesmo se seu conteúdo for inválido.

O botão **Exportar dados locais antigos (JSON)** baixa o conteúdo original desse navegador e endereço, sem modificá-lo. LocalStorage é separado por navegador, protocolo, host e porta: o endereço na porta 3000 não consegue ler dados que estavam na porta 5173.

Para exportar dados da versão anterior, use o navegador original e abra a interface no endereço original. Se necessário, execute `npm run dev` e acesse o mesmo host e porta usados anteriormente. O botão de exportação também está disponível na tela de entrada, mesmo sem uma API configurada para esse endereço. Não apague os dados do navegador antes de exportar. Guarde o arquivo fora do repositório ou na pasta `backups`.

## Banco, backup e recuperação

Por padrão, o banco fica em **data/shopping.sqlite**, fora de `dist`. Catálogo, categorias, listas, itens e histórico são armazenados como estado JSON validado, com revisão, dentro do SQLite. Tabelas adicionais armazenam recibos de operações, verificador de senha, sessões e controle de tentativas. O servidor utiliza transações, WAL e sincronização FULL. Não exponha nem compartilhe o arquivo diretamente com os celulares.

### Gerar backup

```sh
npm run backup
```

O comando usa a API de backup do SQLite e pode ser executado com o servidor em uso. Ele cria um arquivo com data e hora em `backups` e valida sua integridade. Não sobrescreve backups existentes. Não copie somente o arquivo principal enquanto o banco estiver aberto: dados recentes podem estar no arquivo WAL.

O backup inclui os dados compartilhados e a configuração de acesso; trate-o como arquivo privado. Mantenha uma cópia em outro disco, pois backup no mesmo computador não protege contra perda do disco. Não mantenha o banco ativo em pasta de rede ou sincronizada continuamente por serviços de arquivos.

### Restaurar backup

1. Encerre o servidor com Ctrl+C.
2. Execute:

```sh
npm run restore -- "CAMINHO-DO-BACKUP.sqlite"
```

3. Confira o aviso e digite **RESTAURAR** para confirmar a substituição.
4. Execute `npm start` e entre novamente com a senha que estava configurada no backup.

A restauração valida o arquivo antes de substituir a base e cria um backup da base atual. Não restaura enquanto o processo do servidor estiver ativo. Sessões antigas são removidas na restauração, mas os recibos de operações e os dados das compras são preservados. Se necessário, use `npm run password` para definir uma nova senha depois de restaurar.

## Segurança e configuração

Não existem contas individuais: quem conhece a senha tem acesso de leitura e edição ao mesmo espaço doméstico.

O servidor usa cookies HttpOnly e SameSite=Strict, sessões aleatórias armazenadas como hashes, expiração, limitação de tentativas, validação Zod, limite do corpo das requisições e verificação de Host/Origin. Nenhuma rota pública permite baixar o banco, backups ou configurações. Apenas os arquivos da pasta dist são servidos como conteúdo estático.

**HTTP na rede doméstica não criptografa senha, cookies ou dados em trânsito.** Use apenas uma rede confiável. A senha não substitui HTTPS. Não publique esta instância na internet nem redirecione portas do roteador nesta etapa.

O arquivo opcional `.env` é ignorado pelo Git; `.env.example` contém apenas exemplos sem segredos:

| Variável | Padrão | Finalidade |
|---|---|---|
| PORT | 3000 | Porta da aplicação e API |
| HOST | 0.0.0.0 | Interface de escuta; 127.0.0.1 restringe ao computador |
| DATA_DIR | data | Pasta do banco |
| BACKUP_DIR | backups | Pasta dos backups |
| ALLOWED_ORIGINS | localhost e IPv4 locais na porta escolhida | Origens e hosts permitidos, separados por vírgulas |
| COOKIE_SECURE | false | Cookies exclusivos de HTTPS quando true |

Os caminhos são relativos à raiz do projeto. Reinicie o servidor depois de alterar a configuração. A senha não é definida no arquivo .env: use a configuração interativa.

Um futuro túnel HTTPS poderá apontar para o mesmo servidor, mas ainda exigirá revisar origem permitida, cookies Secure e configuração do proxy. Não há túnel, acesso externo, nuvem ou autenticação por provedor configurados nesta versão.

Banco, arquivos auxiliares, backups, notas locais e arquivos de ambiente são ignorados pelo Git. O JSON público do catálogo inicial não contém os dados editados da família.

## Desenvolvimento e testes

No uso diário, frontend e API rodam no mesmo processo. Para desenvolvimento com recarga automática, configure ALLOWED_ORIGINS com as origens exatas de API e Vite, execute `npm run dev:server` e `npm run dev` em terminais separados. O Vite encaminha /api para a porta 3000; se alterar essa porta em desenvolvimento, ajuste o proxy em vite.config.ts.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes unitários e de integração usam bancos temporários. Os testes de navegador iniciam servidores isolados e testam desktop, viewport móvel e dois contextos independentes na mesma base. Nenhum teste usa a senha ou o banco real. Os cenários antigos de compras, catálogo, histórico e temas foram mantidos e adaptados ao acesso compartilhado; a preparação de compras anteriores existe somente nas fixtures dos testes.

## Organização

```text
src/app/             Interface e coordenação da sincronização
src/components/      Controles, temas e exportação local
src/domain/          Modelos, comandos e regras de negócio compartilhadas
src/persistence/     Cliente HTTP e código legado de persistência local
src/data/            Catálogo inicial público
server/              Express, SQLite, acesso, configuração e recuperação
scripts/             Compilação do servidor
tests/               Cenários de navegador isolados
data/                Banco e bloqueio de processo (não versionados)
backups/             Backups privados (não versionados)
```

A API é independente da localização do servidor. As regras de negócio não dependem do Express ou SQLite. Uma futura hospedagem com disco persistente poderá executar o mesmo servidor; outro banco exigirá um novo adaptador e migração explícita dos dados.

## Limitações desta versão

- O computador servidor precisa permanecer ligado e acessível. Não há disponibilidade durante suspensão, desligamento ou perda de rede.
- A sincronização periódica pode levar cerca de dois segundos; navegadores podem suspender páginas em segundo plano.
- A revisão é global: alterações independentes também podem gerar conflitos, que precisam ser revisados pelo usuário.
- O histórico inteiro faz parte do documento armazenado. É adequado ao uso doméstico; volumes maiores poderão exigir tabelas próprias e paginação.
- Não há contas individuais, identificação de quem alterou um item, mesclagem automática de conflitos, suporte offline completo, IA, integrações externas ou serviços de nuvem.
