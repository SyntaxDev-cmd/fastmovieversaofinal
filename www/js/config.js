// ============================================================
//  LOLLIFLIX PC - CONFIGURACAO PRINCIPAL
//  >>> PARA TROCAR DE PAINEL OU FAZER OUTRO APP, EDITE AQUI <<<
// ============================================================
window.APP_CONFIG = {
  // Nome/marca do app (aparece na tela e no login)
  brand: 'MOVIE FAST',

  // >>> CAMINHO DO PAINEL DE CONEXAO <<<
  // Endpoint que devolve os servidores + branding (mesmo do app Roku).
  // Troque esta URL para apontar para outro painel / gerar outro app.
  configEndpoint: 'https://moviefastapp.dexdown.shop/api2.php?cliente=admin',

  // Estilo visual do app: 'classico' | 'neon' | 'cartoes' | 'minimal' | 'cinema'
  // (troque aqui ou pelo Estudio de Apps)
  estilo: 'classico',
  // true = o usuario pode trocar tema e estilo em Ajustes; false = fica sempre o padrao acima
  personalizar: true,

  // Tempo limite das requisicoes (ms)
  requestTimeoutMs: 20000,

  // Quantas contas salvas manter
  maxProfiles: 5,

  // Palavras que marcam conteudo adulto (bloqueio por PIN)
  adultKeywords: ['adult', 'adulto', 'xxx', 'porn', '+18', '18+', 'erotic', 'sexy', 'sex', 'porno']
};
