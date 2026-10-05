export const MESSAGES={
"accountNav":{"ru": "Магазин", "en": "Marketplace"},
"Wallet belongs to another profile; automatic merging is disabled":{"ru": "Этот кошелёк уже принадлежит другому профилю. Автоматическое объединение отключено.", "en": "This wallet belongs to another profile. Automatic merging is disabled."},
"Google identity belongs to another profile; automatic merging is disabled":{"ru": "Этот Google уже связан с другим профилем. Автоматическое объединение отключено.", "en": "This Google identity belongs to another profile. Automatic merging is disabled."},
"Account sign-in required":{"ru": "Войдите в профиль заново.", "en": "Sign in to your account again."},
"Profile already has another wallet":{"ru": "У профиля уже есть другой кошелёк.", "en": "This profile already has another wallet."},
"Profile already has another Google identity":{"ru": "У профиля уже есть другой Google.", "en": "This profile already has another Google identity."},
"Google proof invalid or expired":{"ru": "Подтверждение Google неверно или истекло. Повторите вход.", "en": "The Google proof is invalid or expired. Sign in again."},
"Invalid fulfillment policy":{"ru": "Укажите допустимый тип исполнения и срок: готовый файл — 0 дней, остальные — от 1 до 365.", "en": "Choose a valid fulfillment type and time: ready files need 0 days; other types need 1 to 365."},

"instantDelivery":{"ru": "Получить ваучер и скачать файл", "en": "Redeem voucher and download file"},

"accountTitle":{"ru": "Покупать и продавать", "en": "Buy and sell"},
"accountIntro":{"ru": "Один профиль для покупок и своего магазина. Вход по кошельку или Google; для оплаты в блокчейне нужна отдельная подпись кошелька.", "en": "One profile for purchases and your own store. Sign in with a wallet or Google; blockchain payments require a separate wallet signature."},
"accountWallet":{"ru": "Открыть профиль подключённого кошелька", "en": "Open connected wallet profile"},
"accountGoogle":{"ru": "Войти через Google", "en": "Sign in with Google"},
"accountLinkGoogle":{"ru": "Привязать Google к кошельку", "en": "Link Google to wallet"},
"accountLinkWallet":{"ru": "Привязать подтверждённый кошелёк", "en": "Link verified wallet"},
"accountLogout":{"ru": "Выйти из Google", "en": "Sign out of Google"},
"accountName":{"ru": "Имя магазина / профиля", "en": "Store / profile name"},
"accountSeller":{"ru": "Я хочу продавать", "en": "I want to sell"},
"accountBuyer":{"ru": "Покупатель включён во всех профилях. Режим продавца открывает кабинет товаров.", "en": "Every profile can buy. Seller mode opens the product workspace."},
"accountSave":{"ru": "Сохранить настройки", "en": "Save settings"},
"productTitle":{"ru": "Название товара", "en": "Product title"},
"productDescription":{"ru": "Описание и условия", "en": "Description and terms"},
"productPrice":{"ru": "Цена в тестовых DEMO", "en": "Price in test DEMO"},
"productQuantity":{"ru": "Количество", "en": "Quantity"},
"productKind":{"ru": "Как покупатель получает товар", "en": "How the buyer receives the product"},
"productDays":{"ru": "Срок исполнения, дней", "en": "Fulfillment time, days"},
"productInstant":{"ru": "Готовый цифровой файл — без срока изготовления", "en": "Ready digital file — no production delay"},
"productPhysical":{"ru": "Физический товар — доставка", "en": "Physical product — shipping"},
"productService":{"ru": "Услуга — срок выполнения", "en": "Service — fulfillment time"},
"productCustom":{"ru": "Цифровой товар на заказ", "en": "Custom digital product"},
"productSave":{"ru": "Сохранить товар в кабинете", "en": "Save product to workspace"},
"productDraftScope":{"ru": "Сейчас товары кабинета — приватные черновики. Они не опубликованы в Boson и не принимают оплату. Проверенные тестовые предложения студии доступны ниже.", "en": "Workspace products are private drafts. They are not published on Boson and cannot accept payments. Verified studio test offers are available below."},
"fulfillmentNotice":{"ru": "Готовые файлы: покупка → получение ваучера → выдача проверенного файла. Доставка и услуги: оплата в escrow Boson, исполнение и подтверждение. Срок не завершает заказ автоматически; выплата продавцу следует правилам Boson.", "en": "Ready files: purchase → voucher redemption → verified file delivery. Shipping and services: payment into Boson escrow, fulfillment and confirmation. A deadline never completes an order automatically; seller settlement follows Boson rules."},
"googleUnconfigured":{"ru": "Google пока не активирован: нужен OAuth Client ID и разрешённый адрес сайта. Вход через кошелёк уже доступен.", "en": "Google is not activated yet: an OAuth Client ID and authorized site origin are required. Wallet sign-in is available."},
"accountSignIn":{"ru": "Для кабинета подключите кошелёк и подтвердите адрес выше либо войдите через Google.", "en": "For the workspace, connect and verify your wallet above or sign in with Google."},
"accountSaved":{"ru": "Профиль сохранён.", "en": "Profile saved."},
"productSaved":{"ru": "Черновик сохранён. Оплата для него пока не включена.", "en": "Draft saved. Payments are not enabled for this product yet."},
"accountDraft":{"ru": "Черновик", "en": "Draft"},
"accountSession":{"ru": "Вход выполнен: {mode} · профиль {id}", "en": "Signed in: {mode} · profile {id}"},
"accountNeedWallet":{"ru": "Сначала подтвердите адрес подписью кошелька выше.", "en": "First verify your wallet address with a signature above."},
"accountChanged":{"ru": "Профиль изменился. Откройте его заново.", "en": "The account changed. Open it again."},
"accountOAuthFailed":{"ru": "Не удалось загрузить Google. Повторите вход.", "en": "Could not load Google. Try signing in again."},

  "Wallet transaction reverted":{"ru":"Транзакция отклонена блокчейном. Проверьте доступность предложения и баланс для gas перед новой покупкой.","en":"The blockchain reverted the transaction. Check offer availability and your gas balance before a new purchase."},
  "Unknown wallet intent":{"ru":"Сохранённая операция не найдена для этого кошелька. Сохраните её ключ и хеш для восстановления.","en":"The saved operation was not found for this wallet. Keep its key and hash for recovery."},
  "Cancelled intent has an observed transaction; do not repeat the purchase":{"ru":"У отменённой операции обнаружен хеш транзакции. Не повторяйте покупку; требуется сверка.","en":"The cancelled operation has an observed transaction hash. Do not repeat the purchase; reconciliation is required."},
  "storeFirstScope":{"ru":"Сейчас развиваем магазин: готовые видео, цифровые ресурсы и заказы услуг. Облачный рендер и видеогенерация — следующий этап после финансирования.","en":"Our current focus is the marketplace: finished videos, digital resources and service orders. Cloud rendering and video generation follow after funding."},
  "Wallet request already active or queued":{"ru":"Запрос этого кошелька уже выполняется или ожидает. Подождите.","en":"This wallet request is already running or waiting. Please wait."},
  "Market queue full; retry the same request later":{"ru":"Очередь магазина заполнена. Повторите сохранённый запрос позже.","en":"The market queue is full. Retry your saved request later."},
  "Market queue wait expired; retry the same request later":{"ru":"Время ожидания истекло. Продолжите сохранённый запрос позже.","en":"The wait expired. Continue your saved request later."},
  "Shared market capacity busy; retry the same request later":{"ru":"Магазин занят. Продолжите тот же сохранённый запрос позже.","en":"The market is busy. Continue the same saved request later."},
  "Market capacity lease lost; reconcile the same intent":{"ru":"Ответ операции не подтверждён. Сверьте сохранённую операцию; не отправляйте покупку повторно.","en":"The operation response is unconfirmed. Reconcile the saved intent; do not resend the purchase."},
  "multiuserDocument":{"ru":"Профили, база данных и параллельные операции · RU/EN","en":"Profiles, database and concurrent operations · RU/EN"},
  "profileTitle":{"ru": "Мой профиль", "en": "My profile"},
  "profileIdentity":{"ru": "Постоянный профиль вашего кошелька", "en": "Persistent profile for your wallet"},
  "profileName":{"ru": "Имя в профиле", "en": "Display name"},
  "profileLocale":{"ru": "Язык профиля", "en": "Profile language"},
  "profileSave":{"ru": "Сохранить профиль", "en": "Save profile"},
  "profileSaved":{"ru": "Профиль сохранён", "en": "Profile saved"},
  "Wallet session account changed":{"ru": "Сессия принадлежит другому кошельку. Подтвердите текущий адрес.", "en": "The session belongs to another wallet. Verify your current address."},
  "Profile changed; refresh before saving":{"ru": "Профиль изменён в другой вкладке. Обновите данные перед сохранением.", "en": "The profile changed in another tab. Refresh before saving."},
  "Invalid profile fields":{"ru": "Проверьте имя и язык профиля.", "en": "Check your display name and profile language."},
  "User database unavailable":{"ru": "База данных временно недоступна. Повторите запрос позже.", "en": "The database is temporarily unavailable. Retry later."},
  "Request limit exceeded; retry later":{"ru": "Слишком много запросов. Повторите позже.", "en": "Too many requests. Retry later."},
  "Wallet operation already active":{"ru": "Операция этого кошелька уже выполняется. Подождите.", "en": "An operation for this wallet is already running. Please wait."},
  "Checkout busy; retry the same request later":{"ru": "Магазин занят. Повторите тот же запрос позже.", "en": "Checkout is busy. Retry the same request later."},
  "Wallet ownership signature required":{"ru": "Подтвердите адрес кошелька новой подписью.", "en": "Verify your wallet address with a new signature."},
  "walletSessionExpired":{"ru":"Сессия кошелька истекла. Подтвердите адрес новой подписью для покупок и скачивания.","en":"Your wallet session expired. Verify your address with a new signature to buy or download."},
  "Wallet session expired. Verify your address again.":{"ru":"Сессия кошелька истекла. Подтвердите адрес новой подписью.","en":"Wallet session expired. Verify your address again."},
  "Invalid wallet session proof":{"ru":"Сервер вернул недействительное подтверждение сессии кошелька.","en":"The server returned an invalid wallet session proof."},
  "orderCompleted":{"ru":"Заказ завершён","en":"Order completed"},
  "orderChainState":{"ru":"Состояние Boson: {state}","en":"Boson state: {state}"},
  "retireApproval":{"ru":"Проверить использованный nonce одобрения","en":"Check consumed approval nonce"},
  "retireExplanation":{"ru":"Только для истёкшего одобрения: два RPC должны подтвердить использованный nonce и точную сумму. Покупки этим действием не сбрасываются.","en":"Expired approvals only: two RPCs must confirm the consumed nonce and exact allowance. This action never clears a purchase."},
  "approvalRetired":{"ru":"Истёкшее одобрение помечено как заменённое. История сохранена; повторная отправка не нужна.","en":"The expired approval was marked superseded. Its history is preserved; no resend is needed."},
  "This demo requires a standard wallet account on Base Sepolia; smart-account relay receipts are not supported":{"ru":"Для этого демо нужен стандартный аккаунт Base Sepolia. Квитанции реле смарт-счёта пока не поддерживаются.","en":"This demo requires a standard wallet account on Base Sepolia; smart-account relay receipts are not supported."},
  "Only an expired unbound approval can be retired":{"ru":"Можно восстановить только истёкшее одобрение без привязанной транзакции.","en":"Only an expired unbound approval can be retired."},
  "Approval retirement evidence mismatch":{"ru":"RPC не подтвердили использованный nonce и точную сумму одобрения.","en":"RPCs did not confirm the consumed nonce and exact allowance."},
  "walletProviderWarning": {
    "ru": "Выберите установленный кошелёк. Название сообщает само расширение; устанавливайте MetaMask только с официального сайта.",
    "en": "Choose your installed wallet. Its name is reported by the extension itself; install MetaMask only from the official website."
  },
  "walletDiscoveryConflict": {
    "ru": "Обнаружены конфликтующие объявления кошелька. Этот вариант отключён; перезагрузите страницу и проверьте установленные расширения.",
    "en": "Conflicting wallet announcements were detected. That option is disabled; reload this page and check your installed extensions."
  },
  "walletUnavailable": {
    "ru": "Выбранный кошелёк больше недоступен. Выберите его снова.",
    "en": "The selected wallet is no longer available. Select it again."
  },
  "a0": {
    "ru": "Основная навигация",
    "en": "Main navigation"
  },
  "a1": {
    "ru": "Принятый демонстрационный контент",
    "en": "Accepted demo content"
  },
  "a2": {
    "ru": "Хеш транзакции кошелька",
    "en": "Wallet transaction hash"
  },
  "a3": {
    "ru": "Демонстрация интерфейса для инвесторов",
    "en": "Investor interface demonstration"
  },
  "a4": {
    "ru": "Тип поддержки",
    "en": "Support category"
  },
  "description": {
    "ru": "VidRa AI: монтажная студия, NFT-паспорта и Boson Marketplace на Base Sepolia. Проверяемое демо для аудиторов и грантов.",
    "en": "VidRa AI: video studio, NFT passports and Boson Marketplace on Base Sepolia. A verifiable demo for auditors and funding programs."
  },
  "s000": {
    "ru": "VidRa AI — монтажная студия · Audit & Funding",
    "en": "VidRa AI — video studio · Audit & Funding"
  },
  "s001": {
    "ru": "МОНТАЖНАЯ СТУДИЯ",
    "en": "VIDEO STUDIO"
  },
  "s002": {
    "ru": "Продукт",
    "en": "Product"
  },
  "s003": {
    "ru": "Доказательства",
    "en": "Evidence"
  },
  "s004": {
    "ru": "Финансирование",
    "en": "Funding"
  },
  "s005": {
    "ru": "Аудит",
    "en": "Audit"
  },
  "s006": {
    "ru": "Открыть студию ↗",
    "en": "Open studio ↗"
  },
  "s007": {
    "ru": " BASE SEPOLIA / РАБОЧЕЕ ТЕСТОВОЕ ДЕМО",
    "en": " BASE SEPOLIA / WORKING TESTNET DEMO"
  },
  "s008": {
    "ru": "Создавай.",
    "en": "Create."
  },
  "s009": {
    "ru": "Подтверждай.",
    "en": "Certify."
  },
  "s010": {
    "ru": "Продавай.",
    "en": "Sell."
  },
  "s011": {
    "ru": "Один путь от готового видео до проверяемой версии в блокчейне и заказа через Boson Protocol.",
    "en": "One workflow from a finished video to a verifiable onchain version and an order through Boson Protocol."
  },
  "s012": {
    "ru": "Показать рабочий процесс ↗",
    "en": "Show the workflow ↗"
  },
  "s013": {
    "ru": "Пакет для аудитора ↓",
    "en": "Auditor package ↓"
  },
  "s014": {
    "ru": "VidRa AI — новое название проекта AIMmontag. Демо работает локально на Mac. Тестовые активы не имеют денежной стоимости.",
    "en": "VidRa AI is the new name of AIMmontag. This demo runs locally on a Mac. Test assets have no monetary value."
  },
  "s015": {
    "ru": "01 / РЕАЛЬНЫЙ ЭКСПОРТ СТУДИИ",
    "en": "01 / ACTUAL STUDIO EXPORT"
  },
  "s016": {
    "ru": "Точный файл связан с SHA-256 и подтверждённой выдачей.",
    "en": "The exact file is linked to its SHA-256 hash and verified delivery."
  },
  "s017": {
    "ru": "СТАТУС ИЗ СТУДИИ",
    "en": "LIVE STUDIO STATUS"
  },
  "s018": {
    "ru": "Загрузка публичной сверки…",
    "en": "Loading public verification…"
  },
  "s019": {
    "ru": "Обновить ↻",
    "en": "Refresh ↻"
  },
  "s020": {
    "ru": "01 / ПРОДУКТ",
    "en": "01 / PRODUCT"
  },
  "s021": {
    "ru": "Контент становится",
    "en": "Content becomes"
  },
  "s022": {
    "ru": "проверяемым ресурсом.",
    "en": "a verifiable asset."
  },
  "s023": {
    "ru": "Монтаж и приёмка",
    "en": "Edit and accept"
  },
  "s024": {
    "ru": "Реальный экспорт проходит проверку файла и приёмки. Автоматический callback студии связывает опубликованную версию с её хешем.",
    "en": "An actual export passes file and acceptance checks. The studio callback links the published version to its hash."
  },
  "s025": {
    "ru": "Студия →",
    "en": "Studio →"
  },
  "s026": {
    "ru": "NFT-паспорт",
    "en": "NFT passport"
  },
  "s027": {
    "ru": "15 проверок и on-chain Safe 3/5 выпускают ERC-721 паспорт. Автор может сохранить его без продажи.",
    "en": "15 checks and an onchain Safe 3/5 issue an ERC-721 passport. The creator can keep it without offering it for sale."
  },
  "s028": {
    "ru": "Проверки →",
    "en": "Checks →"
  },
  "s029": {
    "ru": "Отдельное предложение, покупка, rNFT, получение файла и расчёт. Каталог: видео, цифровые ресурсы, услуги и тестовые предметы.",
    "en": "A separate offer, purchase, rNFT, file delivery and settlement. The catalog includes videos, digital resources, services and demo physical items."
  },
  "s030": {
    "ru": "Маркетплейс →",
    "en": "Marketplace →"
  },
  "s031": {
    "ru": "02 / ПУБЛИЧНО ПРОВЕРЯЕМЫЕ РЕЗУЛЬТАТЫ",
    "en": "02 / PUBLICLY VERIFIABLE RESULTS"
  },
  "s032": {
    "ru": "Доказательства",
    "en": "Evidence"
  },
  "s033": {
    "ru": "вместо обещаний.",
    "en": "you can inspect."
  },
  "s034": {
    "ru": "подтверждённых транзакций",
    "en": "confirmed transactions"
  },
  "s035": {
    "ru": "NFT-паспортов",
    "en": "NFT passports"
  },
  "s036": {
    "ru": "предложений Boson",
    "en": "Boson offers"
  },
  "s037": {
    "ru": "заказов",
    "en": "orders"
  },
  "s038": {
    "ru": "Числа появятся после ответа работающей студии. Исторические тесты доступны в отчётах.",
    "en": "Numbers appear after the running studio responds. Historical tests are available in the reports."
  },
  "s039": {
    "ru": "Скачать текущие доказательства ↗",
    "en": "Download current evidence ↗"
  },
  "s040": {
    "ru": "Проверено в демо:",
    "en": "Verified in the demo:"
  },
  "s041": {
    "ru": " отмена и возврат, выдача точных байтов, защита от повторной покупки, восстановление после сбоя и отказ подменённым данным.",
    "en": " cancellation and refund, exact-byte delivery, duplicate-purchase protection, crash recovery and rejection of tampered data."
  },
  "s042": {
    "ru": "Граница проверки:",
    "en": "Verification limits:"
  },
  "s043": {
    "ru": " все 5 подписантов на одном Mac. NFT не доказывает авторские права. Услуги и физическая доставка показаны как тестовые сценарии. Production требует отдельного аудита.",
    "en": " all 5 signers are on one Mac. An NFT does not prove copyright. Services and physical delivery are demo scenarios. Production requires a separate audit."
  },
  "s044": {
    "ru": "Твой кошелёк.",
    "en": "Your wallet."
  },
  "s045": {
    "ru": "Явное подключение.",
    "en": "Explicit connection."
  },
  "s046": {
    "ru": "Доступный кошелёк",
    "en": "Available wallet"
  },
  "s047": {
    "ru": "Поиск кошельков…",
    "en": "Discovering wallets…"
  },
  "s048": {
    "ru": "Подключить кошелёк",
    "en": "Connect wallet"
  },
  "s049": {
    "ru": "Отключить",
    "en": "Disconnect"
  },
  "s050": {
    "ru": "Адрес не подключён.",
    "en": "No address connected."
  },
  "s051": {
    "ru": "Выбрать Base Sepolia",
    "en": "Select Base Sepolia"
  },
  "s052": {
    "ru": "Подтвердить адрес подписью",
    "en": "Verify address by signature"
  },
  "s053": {
    "ru": "Подключение читает адрес и тестовый баланс. Подпись — отдельное действие, без транзакции и разрешения на списание.",
    "en": "Connection reads your address and test balance. Signing is a separate action, without a transaction or spending approval."
  },
  "s054": {
    "ru": "Установить MetaMask с официального сайта ↗",
    "en": "Install MetaMask from the official website ↗"
  },
  "s055": {
    "ru": "Подписывает настоящий MetaMask",
    "en": "Signed by the actual MetaMask"
  },
  "s056": {
    "ru": "Подпись создаёт короткую локальную сессию для вашего адреса на Base Sepolia. Каждая покупка требует отдельного подтверждения в MetaMask.",
    "en": "A signature creates a short local session for your address on Base Sepolia. Each purchase needs its own confirmation in MetaMask."
  },
  "s057": {
    "ru": "Ниже — отдельный checkout: точное одобрение DEMO, покупка, получение и завершение Boson. Заказ и цифровая выдача проверяются по адресу вашего кошелька. Рядом сохранена автоматическая консоль студии для автора и продавца.",
    "en": "This checkout covers exact DEMO approval, purchase, redemption and completion through Boson. Orders and digital delivery are checked against your wallet address. The automated studio console remains available to creators and sellers."
  },
  "s058": {
    "ru": "Открыть проверенный цикл покупки →",
    "en": "Open the verified purchase workflow →"
  },
  "s059": {
    "ru": "Boson через",
    "en": "Boson through"
  },
  "s060": {
    "ru": "ваш демо-кошелёк.",
    "en": "your demo wallet."
  },
  "s061": {
    "ru": "Каждую транзакцию подтверждает MetaMask. Сервер подготавливает точный вызов и сверяет receipt на двух RPC; он не хранит ключ внешнего кошелька.",
    "en": "MetaMask confirms every transaction. The server prepares the exact call and verifies its receipt through two RPCs; it does not store the external wallet key."
  },
  "s062": {
    "ru": "Для покупки подключите кошелёк и подтвердите адрес подписью.",
    "en": "Connect your wallet and verify your address by signature to purchase."
  },
  "s063": {
    "ru": "Тестовое предложение",
    "en": "Test offer"
  },
  "s064": {
    "ru": "Загрузка…",
    "en": "Loading…"
  },
  "s065": {
    "ru": "Условия загружаются…",
    "en": "Loading terms…"
  },
  "s066": {
    "ru": "Одобрить точную цену DEMO",
    "en": "Approve exact DEMO price"
  },
  "s067": {
    "ru": "Купить через MetaMask",
    "en": "Buy through MetaMask"
  },
  "s068": {
    "ru": "Сверить мой кошелёк",
    "en": "Verify my wallet"
  },
  "s069": {
    "ru": "Сначала нужны тестовый ETH для gas и DEMO. Нет денежных покупок; условия тестового предложения показаны выше. Одобрение цены и покупка — отдельные транзакции.",
    "en": "You need test ETH for gas and DEMO first. Purchases use test tokens; offer terms are shown above. Price approval and purchase are separate transactions."
  },
  "s070": {
    "ru": "Если ответ кошелька потерян: хеш отправленной транзакции",
    "en": "If the wallet response was lost: hash of the submitted transaction"
  },
  "s071": {
    "ru": "Продолжить / восстановить запрос",
    "en": "Continue / recover request"
  },
  "s072": {
    "ru": "04 / ДЕМОНСТРАЦИЯ",
    "en": "04 / DEMONSTRATION"
  },
  "s073": {
    "ru": "Посмотреть весь путь.",
    "en": "Watch the full workflow."
  },
  "s074": {
    "ru": "Ролик с русским сопровождением: фактические кадры интерфейса и подтверждённый цикл NFT #4 / заказа #253. Историческая запись использует название AIMmontag. Дополнительный цикл настоящего MetaMask, заказ #261 и точная выдача файла подтверждены в аудиторских отчётах.",
    "en": "English narration accompanies edited actual RU / EN interface captures and the verified NFT #8 / offer #138 / completed order #260 workflow using managed demo wallets. Additional actual MetaMask order #261 and exact-file delivery are documented in the auditor reports."
  },
  "s075": {
    "ru": "Из прототипа —",
    "en": "From a prototype"
  },
  "s076": {
    "ru": "в работающий сервис.",
    "en": "to a working service."
  },
  "s077": {
    "ru": "Ищем средства на инфраструктуру, оборудование, пользовательские кошельки и независимую проверку безопасности.",
    "en": "We are seeking funding for infrastructure, equipment, user wallets and an independent security review."
  },
  "s078": {
    "ru": "Все программы",
    "en": "All programs"
  },
  "s079": {
    "ru": "Деньги / инвестиции",
    "en": "Cash / investment"
  },
  "s080": {
    "ru": "Облачные кредиты",
    "en": "Cloud credits"
  },
  "s081": {
    "ru": "Требуют уточнения",
    "en": "Eligibility to confirm"
  },
  "s082": {
    "ru": "Проверено по официальным источникам 3 октября 2026. Решение о финансировании принимает программа. Кредиты нельзя считать деньгами на покупку оборудования. Поданные заявки пока отсутствуют.",
    "en": "Checked against official sources on October 3, 2026. Each program decides its awards. Credits cannot fund equipment purchases. No applications have been submitted yet."
  },
  "s083": {
    "ru": "Открой документы.",
    "en": "Open the documents."
  },
  "s084": {
    "ru": "Проверь самостоятельно.",
    "en": "Check for yourself."
  },
  "s085": {
    "ru": "Технические JSON-отчёты",
    "en": "Technical JSON reports"
  },
  "s086": {
    "ru": "Документы описывают проверенный демонстратор и задачи до production. Формальный независимый аудит не проводился. Юридическое лицо, команда, бюджет и право на конкретный грант требуют подтверждения владельца.",
    "en": "The documents describe the verified demonstrator and work remaining before production. No formal independent audit has been conducted. The owner must confirm the legal entity, team, budget and eligibility for each grant."
  },
  "s087": {
    "ru": "Следующий кадр —",
    "en": "The next frame"
  },
  "s088": {
    "ru": "за нами.",
    "en": "is ours."
  },
  "s089": {
    "ru": "Запустить демонстрацию ↗",
    "en": "Launch demo ↗"
  },
  "s090": {
    "ru": "Начать проверку →",
    "en": "Start the review →"
  },
  "Кошелёк не найден в этом браузере": {
    "ru": "Кошелёк не найден в этом браузере",
    "en": "No wallet found in this browser"
  },
  "Откройте этот сайт в Chrome / другом браузере с установленным MetaMask.": {
    "ru": "Откройте этот сайт в Chrome / другом браузере с установленным MetaMask.",
    "en": "Open this site in Chrome or another browser with MetaMask installed."
  },
  "Адрес": {
    "ru": "Адрес",
    "en": "Address"
  },
  "Сеть": {
    "ru": "Сеть",
    "en": "Network"
  },
  "Тестовый ETH": {
    "ru": "Тестовый ETH",
    "en": "Test ETH"
  },
  "Адрес подключён к Base Sepolia.": {
    "ru": "Адрес подключён к Base Sepolia.",
    "en": "Address connected to Base Sepolia."
  },
  "Нужна сеть Base Sepolia.": {
    "ru": "Нужна сеть Base Sepolia.",
    "en": "Base Sepolia is required."
  },
  "Адрес не подключён.": {
    "ru": "Адрес не подключён.",
    "en": "No address connected."
  },
  "Подпись создаёт 10-минутную локальную тестовую сессию. Она не разрешает списание: каждая транзакция подтверждается отдельно.": {
    "ru": "Подпись создаёт 10-минутную локальную тестовую сессию. Она не разрешает списание: каждая транзакция подтверждается отдельно.",
    "en": "Signing creates a 10-minute local test session. It does not authorize spending: every transaction is confirmed separately."
  },
  "Запрос отклонён в кошельке.": {
    "ru": "Запрос отклонён в кошельке.",
    "en": "Request rejected in the wallet."
  },
  "Кошелёк недоступен": {
    "ru": "Кошелёк недоступен",
    "en": "Wallet unavailable"
  },
  "Начать проверку · запуск и сценарий": {
    "ru": "Начать проверку · запуск и сценарий",
    "en": "Start here · launch and walkthrough (RU)"
  },
  "Архитектура · безопасность · ограничения": {
    "ru": "Архитектура · безопасность · ограничения",
    "en": "Architecture · security · limitations (RU)"
  },
  "Черновики заявок · RU / EN": {
    "ru": "Черновики заявок · RU / EN",
    "en": "Application drafts · RU / EN"
  },
  "Программы финансирования · критерии": {
    "ru": "Программы финансирования · критерии",
    "en": "Funding programs · eligibility (RU)"
  },
  "План развития · бюджетные сценарии": {
    "ru": "План развития · бюджетные сценарии",
    "en": "Roadmap · budget scenarios (RU)"
  },
  "GitHub · состав публикации": {
    "ru": "GitHub · состав публикации",
    "en": "GitHub · publication scope (RU)"
  },
  "Файл доступен в локальном демонстрационном пакете; на этом запуске media не подключён.": {
    "ru": "Файл доступен в локальном демонстрационном пакете; на этом запуске media не подключён.",
    "en": "The file is in the local demo package; media is not connected for this server instance."
  },
  "Документы временно недоступны: ": {
    "ru": "Документы временно недоступны: ",
    "en": "Documents temporarily unavailable: "
  },
  "Сверка с работающей студией…": {
    "ru": "Сверка с работающей студией…",
    "en": "Verifying with the running studio…"
  },
  "RPC-сверка не подтверждена": {
    "ru": "RPC-сверка не подтверждена",
    "en": "RPC verification is unconfirmed"
  },
  "Есть ожидающая транзакция": {
    "ru": "Есть ожидающая транзакция",
    "en": "A transaction is pending"
  },
  "Студия выполняет операцию": {
    "ru": "Студия выполняет операцию",
    "en": "The studio is processing an operation"
  },
  "Сверено по canonical block · Base Sepolia": {
    "ru": "Сверено по canonical block · Base Sepolia",
    "en": "Verified against a canonical block · Base Sepolia"
  },
  "доступно": {
    "ru": "доступно",
    "en": "available"
  },
  "недоступно": {
    "ru": "недоступно",
    "en": "unavailable"
  },
  "Снимок ответа студии: ": {
    "ru": "Снимок ответа студии: ",
    "en": "Studio response snapshot: "
  },
  ". Детали независимой RPC-сверки — в JSON.": {
    "ru": ". Детали независимой RPC-сверки — в JSON.",
    "en": ". Independent RPC verification details are in the JSON."
  },
  "NFT-паспорта": {
    "ru": "NFT-паспорта",
    "en": "NFT passports"
  },
  "Студия недоступна · ": {
    "ru": "Студия недоступна · ",
    "en": "Studio unavailable · "
  },
  "Актуальный снимок недоступен; предыдущие цифры, если показаны, устарели. Исторические отчёты сохранены.": {
    "ru": "Актуальный снимок недоступен; предыдущие цифры, если показаны, устарели. Исторические отчёты сохранены.",
    "en": "A current snapshot is unavailable; any previous numbers shown are stale. Historical reports are preserved."
  },
  "не указаны": {
    "ru": "не указаны",
    "en": "not specified"
  },
  "Выберите тестовое предложение.": {
    "ru": "Выберите тестовое предложение.",
    "en": "Select a test offer."
  },
  "Официальная программа ↗": {
    "ru": "Официальная программа ↗",
    "en": "Official program ↗"
  },
  "Реестр программ недоступен.": {
    "ru": "Реестр программ недоступен.",
    "en": "Program directory unavailable."
  },
  "Адрес запроса не определён": {
    "ru": "Адрес запроса не определён",
    "en": "Request address is undefined"
  },
  "Не удалось сохранить запрос до подписи": {
    "ru": "Не удалось сохранить запрос до подписи",
    "en": "Could not persist the request before signing"
  },
  "Сессия другого кошелька": {
    "ru": "Сессия другого кошелька",
    "en": "The session belongs to another wallet"
  },
  " Есть незавершённый запрос: ": {
    "ru": " Есть незавершённый запрос: ",
    "en": " There is an unfinished request: "
  },
  ". Восстановите его, не повторяйте покупку.": {
    "ru": ". Восстановите его, не повторяйте покупку.",
    "en": ". Recover it before attempting another purchase."
  },
  "Commit в BaseScan ↗": {
    "ru": "Commit в BaseScan ↗",
    "en": "Commit on BaseScan ↗"
  },
  "Получить заказ": {
    "ru": "Получить заказ",
    "en": "Redeem order"
  },
  "Завершить": {
    "ru": "Завершить",
    "en": "Complete"
  },
  "Отменить": {
    "ru": "Отменить",
    "en": "Cancel"
  },
  "Открыть спор": {
    "ru": "Открыть спор",
    "en": "Open dispute"
  },
  "Отозвать спор": {
    "ru": "Отозвать спор",
    "en": "Retract dispute"
  },
  "Скачать проверенный файл": {
    "ru": "Скачать проверенный файл",
    "en": "Download verified file"
  },
  "Браузер без Web Locks: операции отключены": {
    "ru": "Браузер без Web Locks: операции отключены",
    "en": "This browser has no Web Locks support: operations are disabled"
  },
  "Операция уже открыта в другой вкладке": {
    "ru": "Операция уже открыта в другой вкладке",
    "en": "An operation is already open in another tab"
  },
  "Операция отклонена в MetaMask.": {
    "ru": "Операция отклонена в MetaMask.",
    "en": "Operation rejected in MetaMask."
  },
  "Подтвердите сессию вашего адреса": {
    "ru": "Подтвердите сессию вашего адреса",
    "en": "Verify the session for your address"
  },
  "Сначала восстановите незавершённый запрос": {
    "ru": "Сначала восстановите незавершённый запрос",
    "en": "Recover the unfinished request first"
  },
  "Запрос истёк или уже отправлен": {
    "ru": "Запрос истёк или уже отправлен",
    "en": "The request has expired or was already submitted"
  },
  "Получен файл, SHA-256 проверен: ": {
    "ru": "Получен файл, SHA-256 проверен: ",
    "en": "File received, SHA-256 verified: "
  },
  "Нет сохранённого запроса": {
    "ru": "Нет сохранённого запроса",
    "en": "No saved request"
  },
  "Введите хеш из MetaMask: повторная отправка неоднозначного запроса запрещена": {
    "ru": "Введите хеш из MetaMask: повторная отправка неоднозначного запроса запрещена",
    "en": "Enter the hash from MetaMask: an ambiguous request cannot be sent again"
  },
  "Кошелёк не предоставил адрес": {
    "ru": "Кошелёк не предоставил адрес",
    "en": "The wallet did not provide an address"
  },
  "Сеть изменилась во время запроса": {
    "ru": "Сеть изменилась во время запроса",
    "en": "The network changed during the request"
  },
  "Подключите кошелёк": {
    "ru": "Подключите кошелёк",
    "en": "Connect your wallet"
  },
  "Только Base Sepolia": {
    "ru": "Только Base Sepolia",
    "en": "Base Sepolia only"
  },
  "Кошелёк изменился во время запроса": {
    "ru": "Кошелёк изменился во время запроса",
    "en": "The wallet changed during the request"
  },
  "Требуется Base Sepolia": {
    "ru": "Требуется Base Sepolia",
    "en": "Base Sepolia is required"
  },
  "Транзакция не соответствует подключённому адресу или тестовой сети": {
    "ru": "Транзакция не соответствует подключённому адресу или тестовой сети",
    "en": "The transaction does not match the connected address or test network"
  },
  "unsupported": {
    "ru": "Неподдерживаемая сеть · {chain}",
    "en": "Unsupported network · {chain}"
  },
  "proof": {
    "ru": "Сессия вашего адреса подтверждена: {account}. До {time}. Каждая транзакция требует отдельного подтверждения MetaMask.",
    "en": "Your address session is verified: {account}. Until {time}. Every transaction requires its own MetaMask confirmation."
  },
  "listing": {
    "ru": "{title} · {price} DEMO · offer #{id} · {available}",
    "en": "{title} · {price} DEMO · offer #{id} · {available}"
  },
  "offerTerms": {
    "ru": "{description} · Исходные условия тестового предложения: {terms}. {hash}",
    "en": "{description} · Original test offer terms: {terms}. {hash}"
  },
  "market": {
    "ru": "Ваш адрес: {account}. {balance} DEMO. Сверено в блоке {block}. Реальный MetaMask E2E требует установленного расширения.",
    "en": "Your address: {account}. {balance} DEMO. Verified at block {block}. Actual MetaMask E2E requires the installed extension."
  },
  "order": {
    "ru": "Заказ #{id} · {title}",
    "en": "Order #{id} · {title}"
  },
  "confirm": {
    "ru": "Подтвердите {action}: {price} тестовых DEMO, {title}. Сеть Base Sepolia. Native value = 0.",
    "en": "Confirm {action}: {price} test DEMO, {title}. Network: Base Sepolia. Native value = 0."
  },
  "overview": {
    "ru": "Обзор проекта и аудит · EN",
    "en": "Project and audit overview · EN"
  }
};
Object.assign(MESSAGES,{"Кошелёк изменился. Подключитесь снова.": {"ru": "Кошелёк изменился. Подключитесь снова.", "en": "The wallet changed. Connect again."}, "Нет доступного адреса": {"ru": "Нет доступного адреса", "en": "No available address"}, "Выберите Base Sepolia для демонстрации": {"ru": "Выберите Base Sepolia для демонстрации", "en": "Select Base Sepolia for this demo"}, "Подключите Base Sepolia": {"ru": "Подключите Base Sepolia", "en": "Connect to Base Sepolia"}, "Кошелёк изменился": {"ru": "Кошелёк изменился", "en": "The wallet changed"}, "Wallet transaction identity changed": {"ru": "Адрес или сеть транзакции изменились", "en": "Wallet transaction identity changed"}, "Downloaded SHA-256 differs": {"ru": "SHA-256 скачанного файла не совпадает", "en": "Downloaded SHA-256 differs"}});
Object.assign(MESSAGES,{"Монтажная услуга · demo": {"ru": "Монтажная услуга · demo", "en": "Editing service · demo"}, "Монтаж видео · исходное демо": {"ru": "Монтаж видео · исходное демо", "en": "Video editing · original demo"}, "Демо-лицензия на созданный и принятый видеоэкспорт. NFT-паспорт остаётся у автора.": {"ru": "Демо-лицензия на созданный и принятый видеоэкспорт. NFT-паспорт остаётся у автора.", "en": "Demo access license for the created and accepted video export. The creator retains the NFT passport."}, "Готовое тестовое предложение монтажной студии.": {"ru": "Готовое тестовое предложение монтажной студии.", "en": "An existing demo offer from the video studio."}, "Только демонстрация в тестовой сети; без реального заказа или отправки.": {"ru": "Только демонстрация в тестовой сети; без реального заказа или отправки.", "en": "Public testnet example; no real commission or shipment."}, "Созданный нейтральный CUBE-ресурс; лицензия только для тестирования.": {"ru": "Созданный нейтральный CUBE-ресурс; лицензия только для тестирования.", "en": "Generated neutral CUBE resource; test-only license."}, "Демо-доступ к принятому студией видео; без передачи авторских прав или NFT-паспорта.": {"ru": "Демо-доступ к принятому студией видео; без передачи авторских прав или NFT-паспорта.", "en": "Demo file access to accepted studio video; no copyright or passport transfer."}});
Object.assign(MESSAGES,{"sellerChainTitle": {"ru": "Мой продавец в Boson", "en": "My Boson seller"}, "sellerRegister": {"ru": "Зарегистрировать продавца через кошелёк", "en": "Register seller with wallet"}, "sellerWithdraw": {"ru": "Вывести доступные DEMO", "en": "Withdraw available DEMO"}, "sellerReviewNotice": {"ru": "Три внутренние проверки вызова, затем подтверждение кошелька. Ключи тестовых проверяющих находятся на одном Mac.", "en": "Three internal call reviews, then wallet confirmation. Test reviewer keys are held on one Mac."}, "sellerUploadLabel": {"ru": "Файл цифрового товара · до 64 MiB", "en": "Digital product file · up to 64 MiB"}, "sellerUpload": {"ru": "Загрузить в закрытое хранилище", "en": "Upload to private storage"}, "sellerChooseFile": {"ru": "Выберите файл своего товара", "en": "Choose your product file"}, "sellerAttach": {"ru": "Прикрепить файл к товару", "en": "Attach file to product"}, "sellerPublish": {"ru": "Опубликовать в Boson через кошелёк", "en": "Publish on Boson with wallet"}, "sellerReserved": {"ru": "Публикация зарезервирована", "en": "Publication reserved"}, "sellerPublished": {"ru": "Опубликован в Boson", "en": "Published on Boson"}, "sellerRecover": {"ru": "Восстановить операцию кошелька →", "en": "Recover wallet operation →"}, "sellerCancelReservation": {"ru": "Снять резерв, если вызов ещё не подготовлен", "en": "Release reservation if no call was prepared"}, "sellerSyncNeeded": {"ru": "Нажмите «Сверить мой кошелёк», чтобы проверить регистрацию в Boson.", "en": "Click “Sync my wallet” to check your Boson registration."}, "sellerRegistered": {"ru": "Продавец Boson #{id}. Доступно к выводу: {balance} DEMO.", "en": "Boson seller #{id}. Available to withdraw: {balance} DEMO."}, "sellerForeignRoles": {"ru": "В этом аккаунте Boson роли продавца не совпадают с вашим кошельком. Операции отключены.", "en": "This Boson account has seller roles that differ from your wallet. Operations are disabled."}, "sellerUnregistered": {"ru": "Кошелёк ещё не зарегистрирован как продавец Boson.", "en": "This wallet is not registered as a Boson seller yet."}, "sellerFileLimit": {"ru": "Выберите непустой файл до 64 MiB.", "en": "Choose a nonempty file up to 64 MiB."}, "sellerUploaded": {"ru": "Файл {name} сохранён. SHA-256: {hash}. Прикрепите его к товару перед публикацией.", "en": "File {name} stored. SHA-256: {hash}. Attach it to your product before publication."}, "fulfillmentDue": {"ru": "Срок исполнения: {days} дней от получения ваучера, до {date}. Срок не завершает заказ автоматически.", "en": "Fulfillment: {days} days from voucher redemption, due {date}. The deadline does not settle the order automatically."}, "Product publication reserved; recover the same operation": {"ru": "Публикация зарезервирована. Восстановите эту же операцию кошелька.", "en": "Publication is reserved. Recover the same wallet operation."}, "Verified ready file required before publication": {"ru": "Сначала загрузите и прикрепите проверенный готовый файл.", "en": "Upload and attach a verified ready file first."}, "No finalized DEMO funds available": {"ru": "Нет доступных средств DEMO по завершённым заказам.", "en": "No finalized DEMO funds are available."}, "Use the wallet journal to reconcile this operation": {"ru": "Запрос уже подготовлен. Восстановите его через журнал кошелька.", "en": "The request was prepared. Recover it through the wallet journal."}, "productDraftScope": {"ru": "Товар остаётся приватным черновиком до вашей подписи и проверки транзакции Boson. Для готового цифрового товара сначала загрузите и прикрепите файл.", "en": "A product remains a private draft until your signature and verification of the Boson transaction. Upload and attach a file before publishing a ready digital product."}, "fulfillmentNotice": {"ru": "Готовый файл: точное одобрение DEMO, затем покупка и получение ваучера одной транзакцией, выдача файла. Доставка и услуги: escrow Boson и срок от получения ваучера. Выплата продавцу — после завершения по правилам Boson; срок сам по себе не завершает заказ.", "en": "Ready file: exact DEMO approval, then purchase and voucher redemption in one transaction, followed by file delivery. Shipping and services use Boson escrow with fulfillment time from redemption. Seller funds become available after finalization under Boson rules; a deadline does not settle an order."}});
export function resolveLanguage(search='',storage=null){
  const requested=new URLSearchParams(search).get('lang');
  if(requested==='ru'||requested==='en')return requested;
  try{const saved=storage?.getItem('vidra-language');if(saved==='ru'||saved==='en')return saved;}catch{}
  return 'ru';
}
let language=resolveLanguage(globalThis.location?.search,(()=>{try{return globalThis.localStorage;}catch{return null;}})());
export const getLanguage=()=>language;
export const locale=()=>language==='en'?'en-US':'ru-RU';
export function t(key,values={}){const text=MESSAGES[key]?.[language]??key;return text.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);}
export function localizeError(text){for(const pair of Object.values(MESSAGES))if(text===pair.ru||text===pair.en)return pair[language];return text;}
export function setLanguage(next){if(next!=='ru'&&next!=='en')throw new Error('Unsupported language');language=next;try{globalThis.localStorage?.setItem('vidra-language',next);}catch{}if(globalThis.location&&globalThis.history){const url=new URL(globalThis.location.href);url.searchParams.set('lang',next);globalThis.history.replaceState(null,'',url);}}
export function applyLanguage(doc){doc.documentElement.lang=language;for(const el of doc.querySelectorAll('[data-i18n]'))el.textContent=t(el.dataset.i18n);for(const el of doc.querySelectorAll('[data-i18n-aria]'))el.setAttribute('aria-label',t(el.dataset.i18nAria));for(const el of doc.querySelectorAll('[data-i18n-content]'))el.setAttribute('content',t(el.dataset.i18nContent));for(const el of doc.querySelectorAll('a[href^="http://127.0.0.1:18339/"]')){const url=new URL(el.href);url.searchParams.set('lang',language);el.href=url.toString();}for(const el of doc.querySelectorAll('[data-document-start]'))el.setAttribute('href',language==='en'?'/docs/AUDITOR_OVERVIEW_EN.txt':'/docs/START_HERE_RU.txt');for(const el of doc.querySelectorAll('[data-language]'))el.setAttribute('aria-pressed',String(el.dataset.language===language));}
