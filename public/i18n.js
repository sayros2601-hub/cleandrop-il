(function (global) {
  'use strict';

  const TRANSLATIONS = {
    he: {
      dir: 'rtl',
      langName: 'עברית',
      brandTagline: 'הזבל יורד לבד — בלי לצאת מהבית',
      heroBadge: 'שליח שכבר באזור • איסוף מהיר מדלת הדירה',
      heroTitle: 'השליח כבר פה? תן לו להוריד גם את הזבל',
      heroSubtitle: 'מכניסים כתובת פעם אחת וזהו — לוחצים, פותחים דלת או שמים בחוץ, ומקבלים צילום ליד הפח.',
      installPrompt: 'רוצה אייקון של CleanDrop במסך הבית?',
      installBtn: 'התקן אפליקציה',
      installIosTip: 'באייפון: לחצו על כפתור השיתוף (Share) ובחרו "הוסף למסך הבית".',
      courierBtn: 'מצב שליח',
      backToClient: 'חזרה להזמנה',
      secTariff: '1. מה מורידים היום?',
      popularBadge: 'הכי מבוקש',
      tariffs: {
        small: {
          title: 'שקית רגילה (עד 35 ליטר)',
          desc: 'שקית אחת סגורה — אידיאלי על הדרך עם משלוח אוכל',
          tag: 'מתחיל ב-10 ₪'
        },
        large: {
          title: '2 שקיות / שקית גדולה',
          desc: 'עד 70 ליטר או 2 שקיות סגורות יחד',
          tag: 'חיסכון למשפחה'
        },
        cardboard: {
          title: 'קרטונים ומיחזור',
          desc: 'קופסאות משלוחים, בקבוקים ואריזות לקרטונייה',
          tag: 'מיון נקי'
        },
        standalone: {
          title: 'הזמנה נפרדת עד הדלת',
          desc: 'הגעה במיוחד באזור שלך — גם בלי הזמנת אוכל',
          tag: 'תוך זמן קצר'
        },
        pass10: {
          title: 'כרטיסייה — 10 הוצאות',
          desc: 'תשלום חד-פעמי ל-10 איסופים • תקף לחודשיים',
          tag: 'הכי משתלם'
        }
      },
      addonsTitle: 'תוספות אופציונליות',
      addons: {
        extra_bag: 'עוד שקית (+5 ₪)',
        no_elevator: 'קומה 3+ בלי מעלית (+5 ₪)',
        heavy_litter: 'שקית כבדה / חול לחתולים (+5 ₪)'
      },
      secAddress: '2. מאיפה לאסוף? (נשמר אוטומטית לפעם הבאה)',
      savedAddressLabel: 'כתובת שמורה להזמנה מהירה:',
      editAddress: 'עריכה',
      saveAddressPreview: 'שמור והמשך',
      floorShort: 'קומה',
      aptShort: 'דירה',
      intercomShort: 'אינטרקום',
      fields: {
        client_name: 'שם מלא',
        client_name_ph: 'למשל: דני כהן',
        phone: 'טלפון / וואטסאפ',
        phone_ph: '05X-XXXXXXX',
        city: 'עיר',
        city_ph: 'תל אביב / רמת גן / חולון...',
        street: 'רחוב ומספר בית',
        street_ph: 'דיזנגוף 100',
        floor: 'קומה',
        floor_ph: '3',
        apartment: 'דירה',
        apartment_ph: '12',
        intercom: 'קוד אינטרקום / כניסה',
        intercom_ph: '4589# או ללא קוד',
        notes: 'הערה לשליח (אופציונלי)',
        notes_ph: 'למשל: השקית משמאל לדלת, בזהירות עם החתול'
      },
      secHandover: '3. איך למסור ומתי?',
      handoverModes: {
        door_5min: {
          title: 'ליד הדלת (הודעה 5 דק׳ לפני)',
          desc: 'השליח כותב בוואטסאפ 5 דק׳ לפני — מוציאים לדלת בלי בלגן וקנסות'
        },
        hand: {
          title: 'ביד — כשאתם בבית',
          desc: 'השליח מצלצל באינטרקום/בדלת ולוקח מיד'
        }
      },
      slots: {
        now: 'עכשיו / בהקדם',
        evening: 'ערב (18:00–22:00)',
        custom: 'לכתוב בהערה'
      },
      secPayment: '4. איך נוח לך לשלם?',
      payments: {
        cash: { title: 'מזומן', sub: 'ישירות לשליח במסירה' },
        card: { title: 'אשראי (Visa / Mastercard)', sub: 'תשלום מאובטח בכרטיס' },
        bit: { title: 'ביט (Bit)', sub: 'העברה מהירה לנייד' },
        paybox: { title: 'פייבוקס (PayBox)', sub: 'העברה מהירה בקליק' }
      },
      cardGatewayReadyMsg: 'אחרי שליחת ההזמנה ייפתח כפתור לתשלום מאובטח ב-Visa / Mastercard.',
      cardGatewayPendingMsg: 'חיבור הסליקה האוטומטי בהקמה — ניתן לבחור באשראי ולשלם דרך לינק סליקה מהשליח, או להחליף למזומן/ביט.',
      municipalNotice: 'חשוב לפי חוקי העירייה: אוספים רק זבל ביתי סגור וקרטונים. לא מפנים פסולת בניין, ריהוט או מכשירי חשמל (כדי למנוע קנסות מ-475 ₪).',
      submitOrderBtn: 'הזמן פינוי — {price} ₪',
      submitting: 'שולח הזמנה...',
      validationErr: 'נא למלא שם, טלפון, עיר ורחוב.',
      recentOrdersTitle: 'ההזמנות האחרונות שלך',
      tracker: {
        title: 'סטטוס ההזמנה שלך',
        orderNum: 'הזמנה',
        steps: {
          pending: 'ההזמנה התקבלה',
          on_the_way: 'השליח בדרך (5 דק׳)',
          picked_up: 'נאסף מהדלת',
          done: 'נזרק בפח ✓'
        },
        cancelled: 'ההזמנה בוטלה',
        paidBadge: 'שולם ✓',
        unpaidBadge: 'ממתין לתשלום',
        payCardBtn: 'שלם עכשיו ב-Visa / Mastercard ({price} ₪)',
        payCardWaitMsg: 'השליח ישלח לינק תשלום באשראי או יסדיר במסירה.',
        bitInstructions: 'להעברה ב-Bit למספר:',
        copyBtn: 'העתק מספר',
        copied: 'הועתק!',
        payboxOpen: 'פתח PayBox',
        cashInstructions: 'תשלום במזומן ({price} ₪) לשליח במסירה.',
        proofTitle: 'אישור צילום ליד הפח',
        whatsappCourier: 'שלח הודעה לשליח',
        newOrderBtn: 'הזמנה חדשה'
      },
      courier: {
        loginTitle: 'כניסת שליח / ניהול',
        loginSub: 'הזינו קוד PIN (ברירת מחדל בהתחלה: 1234)',
        pinPlaceholder: 'קוד PIN',
        loginBtn: 'כניסה',
        wrongPin: 'קוד שגוי, נסו שוב',
        tabs: {
          orders: 'הזמנות',
          stats: 'הכנסות',
          qr: 'כרטיס QR',
          settings: 'הגדרות'
        },
        quickDoorBtn: '+ הוצאה מהירה מדלת (10 ₪)',
        quickDoorTitle: 'תיעוד הוצאה מהירה עם משלוח אוכל',
        quickSaveBtn: 'שמור כהושלם ✓',
        filterActive: 'פעילות',
        filterDone: 'הושלמו',
        filterAll: 'הכל',
        emptyOrders: 'אין כרגע הזמנות בקטגוריה זו',
        wazeBtn: 'נווט ב-Waze',
        mapsBtn: 'Google Maps',
        wa5minBtn: 'וואטסאפ: 5 דק׳',
        callBtn: 'חייג',
        markPaid: 'סמן כשולם',
        paidDone: 'שולם ✓',
        btnOnTheWay: '🚗 בדרך (5 דק׳)',
        btnPickedUp: '🛍️ נאסף מהדלת',
        btnPhotoDone: '📸 צלם ליד הפח וסיים',
        btnMarkDoneNoPhoto: '✓ סיים בלי צילום',
        deleteBtn: 'מחק',
        statsTodayRev: 'הכנסה היום',
        statsTodayCount: 'איסופים היום',
        statsActiveNow: 'פעילים כרגע',
        statsMonthRev: 'הכנסה החודש',
        statsPaidVsUnpaid: 'שולם / ממתין',
        qrHeadline: 'סרוק את ה-QR והזמן הוצאת זבל בקליק',
        qrSub: 'כרטיסייה לשכן / מדבקה לדלת • עברית, ערבית ורוסית',
        qrPrintBtn: 'הדפס / שמור כרטיס',
        qrCopyLink: 'העתק קישור ללקוחות',
        settingsTitle: 'הגדרות עסק, מחירים וסליקת אשראי',
        settingsSaved: 'ההגדרות נשמרו בהצלחה!',
        saveSettingsBtn: 'שמור הגדרות',
        gatewayGuideTitle: 'חיבור סליקת Visa / Mastercard לחשבון העסקי שלך:',
        gatewayGuideDesc: 'כשתפתח עוסק פטור/מורשה ותתחבר לחברת סליקה ישראלית (Grow/משולם, PayPlus, Tranzila או Cardcom), פשוט הזן כאן את הלינק או פרטי המסוף — והלקוחות ישלמו באשראי ישירות לחשבון שלך.',
        logoutBtn: 'יציאה ממצב שליח'
      },
      wa5minTemplate: 'היי {name}! זה השליח של CleanDrop 👋 אני 5 דקות מהבניין שלך ({street}). אפשר להוציא את השקית ליד הדלת או שאצלצל באינטרקום.',
      waClientToCourier: 'היי! לגבי הזמנה {id} ({street}): '
    },

    ar: {
      dir: 'rtl',
      langName: 'العربية',
      brandTagline: 'بنطلّع الزبالة عنك — وإنت مرتاح بالبيت',
      heroBadge: 'المندوب أصلاً بالمنطقة • خدمة سريعة لباب الشقة',
      heroTitle: 'المندوب واصل لعندك؟ خلّيه ينزّل كيس الزبالة بطريقه',
      heroSubtitle: 'بتسجّل عنوانك مرة وحدة وبس — كبسة زر، بتحط الكيس عند الباب أو بتسلمه باليد، وبيوصلك تصوير عند الحاوية.',
      installPrompt: 'حابب تحط أيقونة CleanDrop على شاشة تلفونك؟',
      installBtn: 'تثبيت التطبيق',
      installIosTip: 'على الآيفون: اكبس زر المشاركة (Share) واختر "إضافة إلى الشاشة الرئيسية".',
      courierBtn: 'دخول المندوب',
      backToClient: 'رجوع للطلب',
      secTariff: '1. شو بدك ننزل اليوم؟',
      popularBadge: 'الأكثر طلباً',
      tariffs: {
        small: {
          title: 'كيس عادي (لحد 35 لتر)',
          desc: 'كيس واحد مربوط منيح — ممتاز عالطريق مع توصيل الأكل',
          tag: 'ابتداءً من 10 ₪'
        },
        large: {
          title: 'كيس كبير أو كيسين',
          desc: 'لحد 70 لتر أو كيسين عاديين مربوطين',
          tag: 'أوفر للعيلة'
        },
        cardboard: {
          title: 'كراتين وتدوير',
          desc: 'كراتين طلبات مطوية، قناني وبلاستيك لحاوية التدوير',
          tag: 'فرز نظيف'
        },
        standalone: {
          title: 'طلب خاص لباب البيت',
          desc: 'مشوار مخصوص بمنطقتك — حتى بدون طلب أكل',
          tag: 'توصيل سريع'
        },
        pass10: {
          title: 'بطاقة اشتراك — 10 طلعات',
          desc: 'دفعة وحدة لـ 10 طلعات بسعر أرخص • صالحة لشهرين',
          tag: 'أحسن توفير'
        }
      },
      addonsTitle: 'إضافات اختيارية',
      addons: {
        extra_bag: 'كيس إضافي (+5 ₪)',
        no_elevator: 'طابق 3+ بدون مصعد (+5 ₪)',
        heavy_litter: 'كيس ثقيل / رمل قطط (+5 ₪)'
      },
      secAddress: '2. من وين نستلم؟ (بنحفظه تلقائي للمرة الجاي)',
      savedAddressLabel: 'العنوان المحفوظ للطلب السريع:',
      editAddress: 'تعديل',
      saveAddressPreview: 'احفظ وكمل',
      floorShort: 'طابق',
      aptShort: 'شقة',
      intercomShort: 'إنتركوم',
      fields: {
        client_name: 'الاسم الكامل',
        client_name_ph: 'مثال: أمير منصور',
        phone: 'رقم التلفون / واتساب',
        phone_ph: '05X-XXXXXXX',
        city: 'البلد / المدينة',
        city_ph: 'تل أبيب / يافا / رمات غان...',
        street: 'الشارع ورقم العمارة',
        street_ph: 'ديزنغوف 100',
        floor: 'الطابق',
        floor_ph: '3',
        apartment: 'رقم الشقة',
        apartment_ph: '12',
        intercom: 'كود الإنتركوم / الباب',
        intercom_ph: '4589# أو بدون كود',
        notes: 'ملاحظة للمندوب (اختياري)',
        notes_ph: 'مثال: الكيس على يسار الباب، دير بالك عالباب'
      },
      secHandover: '3. كيف ومتى التسليم؟',
      handoverModes: {
        door_5min: {
          title: 'عند الباب (ببعتلك مسج قبل بـ 5 دقايق)',
          desc: 'المندوب ببعتلك واتساب قبل ما يوصل بـ 5 دقايق — بتحط الكيس برا بدون ما يطوّل وبدون مخالفات'
        },
        hand: {
          title: 'باليد — لما تكون بالبيت',
          desc: 'المندوب برن عالإنتركوم أو الباب وباخد الكيس علطول'
        }
      },
      slots: {
        now: 'هسا / بأقرب وقت',
        evening: 'المسا (18:00–22:00)',
        custom: 'اكتب بالملاحظة'
      },
      secPayment: '4. كيف حابب تدفع؟',
      payments: {
        cash: { title: 'كاش (نقدي)', sub: 'مباشرة للمندوب وقت الاستلام' },
        card: { title: 'بطاقة (Visa / Mastercard)', sub: 'دفع آمن بالبطاقة' },
        bit: { title: 'بيت (Bit)', sub: 'تحويل سريع عالرقم' },
        paybox: { title: 'باي بوكس (PayBox)', sub: 'تحويل سريع بكبسة' }
      },
      cardGatewayReadyMsg: 'بعد تأكيد الطلب رح يفتحلك زر الدفع الآمن ببطاقة Visa / Mastercard.',
      cardGatewayPendingMsg: 'ربط الدفع الإلكتروني قيد التجهيز — بتقدر تختار البطاقة وتدفع عبر رابط من المندوب، أو تختار كاش/Bit.',
      municipalNotice: 'مهم حسب قانون البلدية: بنشيل زبالة بيتية مربوطة وكراتين بس. ممنوع مخلفات بناء، عفش أو أجهزة كهربائية (لتفادي غرامات البلدية من 475 ₪).',
      submitOrderBtn: 'اطلب الاستلام — {price} ₪',
      submitting: 'جاري إرسال الطلب...',
      validationErr: 'رجاءً عبّي الاسم، التلفون، المدينة والشارع.',
      recentOrdersTitle: 'طلباتك الأخيرة',
      tracker: {
        title: 'حالة طلبك الآن',
        orderNum: 'طلب',
        steps: {
          pending: 'تم استلام الطلب',
          on_the_way: 'المندوب بالطريق (5 دقايق)',
          picked_up: 'انأخذ من الباب',
          done: 'انرمى بالحاوية ✓'
        },
        cancelled: 'تم إلغاء الطلب',
        paidBadge: 'مدفوع ✓',
        unpaidBadge: 'بانتظار الدفع',
        payCardBtn: 'ادفع هسا بـ Visa / Mastercard ({price} ₪)',
        payCardWaitMsg: 'المندوب رح يبعتلك رابط دفع بالبطاقة أو بتسويها عند التسليم.',
        bitInstructions: 'للتحويل عبر Bit على الرقم:',
        copyBtn: 'نسخ الرقم',
        copied: 'تم النسخ!',
        payboxOpen: 'افتح PayBox',
        cashInstructions: 'الدفع كاش ({price} ₪) للمندوب وقت التسليم.',
        proofTitle: 'صورة الإثبات عند الحاوية',
        whatsappCourier: 'ابعت رسالة للمندوب',
        newOrderBtn: 'طلب جديد'
      },
      courier: {
        loginTitle: 'دخول المندوب / الإدارة',
        loginSub: 'اكتب رمز PIN (الافتراضي بالبداية: 1234)',
        pinPlaceholder: 'رمز PIN',
        loginBtn: 'دخول',
        wrongPin: 'الرمز غلط، جرب مرة تانية',
        tabs: {
          orders: 'الطلبات',
          stats: 'الأرباح',
          qr: 'كرت QR',
          settings: 'الإعدادات'
        },
        quickDoorBtn: '+ تسجيل طلعة سريعة (10 ₪)',
        quickDoorTitle: 'تسجيل طلعة زبالة سريعة مع توصيل الأكل',
        quickSaveBtn: 'احفظ كمكتمل ✓',
        filterActive: 'النشطة',
        filterDone: 'المكتملة',
        filterAll: 'الكل',
        emptyOrders: 'ما في طلبات بهالقسم حالياً',
        wazeBtn: 'توجيه بـ Waze',
        mapsBtn: 'Google Maps',
        wa5minBtn: 'واتساب: 5 دقايق',
        callBtn: 'اتصال',
        markPaid: 'تأكيد الدفع',
        paidDone: 'مدفوع ✓',
        btnOnTheWay: '🚗 بالطريق (5 دقايق)',
        btnPickedUp: '🛍️ استلمت الكيس',
        btnPhotoDone: '📸 صوّر عند الحاوية وأنهي',
        btnMarkDoneNoPhoto: '✓ إنهاء بدون صورة',
        deleteBtn: 'حذف',
        statsTodayRev: 'دخل اليوم',
        statsTodayCount: 'طلعات اليوم',
        statsActiveNow: 'نشط حالياً',
        statsMonthRev: 'دخل الشهر',
        statsPaidVsUnpaid: 'مدفوع / غير مدفوع',
        qrHeadline: 'امسح الـ QR واطلب تنزيل الزبالة بكبسة',
        qrSub: 'كرت للزبون / ملصق للعمارة • عربي، عبري وروسي',
        qrPrintBtn: 'طباعة / حفظ الكرت',
        qrCopyLink: 'نسخ رابط الزبائن',
        settingsTitle: 'إعدادات الشغل، الأسعار وبوابة الدفع',
        settingsSaved: 'تم حفظ الإعدادات بنجاح!',
        saveSettingsBtn: 'حفظ الإعدادات',
        gatewayGuideTitle: 'ربط بطاقات Visa / Mastercard بحسابك التجاري:',
        gatewayGuideDesc: 'بس تفتح ملف عوسيك باتور/مورشيه وتشترك مع شركة دفع إسرائيلية (Grow/Meshulam، PayPlus، Tranzila أو Cardcom)، حط الرابط أو بيانات المحطة هون — والمصاري بتنزل مباشرة عحسابك.',
        logoutBtn: 'خروج من وضع المندوب'
      },
      wa5minTemplate: 'مرحبا {name}! معك مندوب CleanDrop 👋 أنا بعد 5 دقايق عند العمارة ({street}). بتقدر تحط الكيس عند الباب أو برنّلك عالإنتركوم.',
      waClientToCourier: 'مرحبا! بخصوص الطلب {id} ({street}): '
    },

    ru: {
      dir: 'ltr',
      langName: 'Русский',
      brandTagline: 'Вынесем мусор в один клик — не выходя из дома',
      heroBadge: 'Курьер уже в районе • Заберём прямо от двери',
      heroTitle: 'Принесли еду или просто лень идти к баку?',
      heroSubtitle: 'Адрес вводится один раз и сохраняется. Нажал кнопку — выставил пакет за дверь — получил фото у бака.',
      installPrompt: 'Добавить иконку CleanDrop на экран телефона?',
      installBtn: 'Установить приложение',
      installIosTip: 'На iPhone: нажмите «Поделиться» (Share) → «На экран Домой».',
      courierBtn: 'Режим курьера',
      backToClient: 'Назад к заказу',
      secTariff: '1. Что нужно вынести?',
      popularBadge: 'Хит • как чаевые',
      tariffs: {
        small: {
          title: 'Обычный пакет (до 35 л)',
          desc: '1 завязанный бытовой пакет — идеально попутно с доставкой еды',
          tag: 'от 10 ₪'
        },
        large: {
          title: '2 пакета / большой мешок',
          desc: 'До 70 л или два стандартных пакета за раз',
          tag: 'Выгодно семье'
        },
        cardboard: {
          title: 'Картон и сортировка',
          desc: 'Коробки от посылок и пиццы, бутылки в картонию/מיחזור',
          tag: 'Чистый подъезд'
        },
        standalone: {
          title: 'Отдельный вызов по району',
          desc: 'Заеду специально без заказа еды в удобное время',
          tag: 'Быстрый забор'
        },
        pass10: {
          title: 'Абонемент — 10 выносов',
          desc: 'Пакет на 10 вызовов со скидкой • действует 2 месяца',
          tag: 'Максимум выгоды'
        }
      },
      addonsTitle: 'Дополнительные опции',
      addons: {
        extra_bag: 'Ещё пакет (+5 ₪)',
        no_elevator: '3+ этаж без лифта (+5 ₪)',
        heavy_litter: 'Тяжёлый / кошачий наполнитель (+5 ₪)'
      },
      secAddress: '2. Откуда забрать? (сохранится для следующих заказов)',
      savedAddressLabel: 'Сохранённый адрес (в 1 клик):',
      editAddress: 'Изменить',
      saveAddressPreview: 'Сохранить и дальше',
      floorShort: 'эт.',
      aptShort: 'кв.',
      intercomShort: 'домофон',
      fields: {
        client_name: 'Имя',
        client_name_ph: 'Например: Алекс',
        phone: 'Телефон / WhatsApp',
        phone_ph: '05X-XXXXXXX',
        city: 'Город',
        city_ph: 'Тель-Авив / Бат-Ям / Рамат-Ган...',
        street: 'Улица и номер дома',
        street_ph: 'Дизенгоф 100',
        floor: 'Этаж',
        floor_ph: '3',
        apartment: 'Квартира',
        apartment_ph: '12',
        intercom: 'Код домофона / входа',
        intercom_ph: '4589# или без кода',
        notes: 'Комментарий курьеру (необязательно)',
        notes_ph: 'Например: пакет слева от двери, не звонить'
      },
      secHandover: '3. Как забрать и когда?',
      handoverModes: {
        door_5min: {
          title: 'От двери (напишу в WhatsApp за 5 мин)',
          desc: 'Выставляете пакет перед самым приходом — без запаха и штрафов ваад байта'
        },
        hand: {
          title: 'Лично в руки',
          desc: 'Позвоню в домофон/дверь и заберу прямо из рук'
        }
      },
      slots: {
        now: 'Сейчас / по пути',
        evening: 'Вечером (18:00–22:00)',
        custom: 'Указано в комменте'
      },
      secPayment: '4. Способ оплаты',
      payments: {
        cash: { title: 'Наличные', sub: 'Курьеру при встрече' },
        card: { title: 'Карта (Visa / Mastercard)', sub: 'Онлайн-оплата картой' },
        bit: { title: 'Bit (ביט)', sub: 'Мгновенный перевод по номеру' },
        paybox: { title: 'PayBox', sub: 'Быстрая оплата ссылкой' }
      },
      cardGatewayReadyMsg: 'Сразу после оформления откроется безопасная страница оплаты Visa / Mastercard.',
      cardGatewayPendingMsg: 'Эквайринг настраивается — можно выбрать карту (курьер пришлёт платёжную ссылку) либо оплатить наличными / Bit.',
      municipalNotice: 'Важно по правилам ирии: забираем только завязанный бытовой мусор и картон. Строймусор, мебель и технику не вывозим (муниципальные штрафы от 475 ₪).',
      submitOrderBtn: 'Вызвать вынос — {price} ₪',
      submitting: 'Отправляем заявку...',
      validationErr: 'Заполните имя, телефон, город и улицу.',
      recentOrdersTitle: 'Ваши недавние заказы',
      tracker: {
        title: 'Статус вашего заказа',
        orderNum: 'Заказ',
        steps: {
          pending: 'Заявка получена',
          on_the_way: 'Курьер в пути (5 мин)',
          picked_up: 'Забрал от двери',
          done: 'Выкинуто в бак ✓'
        },
        cancelled: 'Заказ отменён',
        paidBadge: 'Оплачено ✓',
        unpaidBadge: 'Ожидает оплаты',
        payCardBtn: 'Оплатить Visa / Mastercard ({price} ₪)',
        payCardWaitMsg: 'Курьер пришлёт платёжную ссылку на карту или примет оплату на месте.',
        bitInstructions: 'Перевод в Bit на номер:',
        copyBtn: 'Скопировать',
        copied: 'Скопировано!',
        payboxOpen: 'Открыть PayBox',
        cashInstructions: 'Оплата наличными ({price} ₪) при передаче пакета.',
        proofTitle: 'Фотоотчёт у бака',
        whatsappCourier: 'Написать курьеру',
        newOrderBtn: 'Новый заказ'
      },
      courier: {
        loginTitle: 'Панель курьера / владельца',
        loginSub: 'Введите PIN-код (на старте: 1234 — смените в настройках)',
        pinPlaceholder: 'PIN-код',
        loginBtn: 'Войти',
        wrongPin: 'Неверный PIN-код',
        tabs: {
          orders: 'Заказы',
          stats: 'Касса',
          qr: 'QR-визитка',
          settings: 'Настройки'
        },
        quickDoorBtn: '+ Быстрый вынос у двери (10 ₪)',
        quickDoorTitle: 'Учёт выноса по пути с доставкой еды',
        quickSaveBtn: 'Записать как выполненный ✓',
        filterActive: 'Активные',
        filterDone: 'Готовые',
        filterAll: 'Все',
        emptyOrders: 'В этой вкладке пока пусто',
        wazeBtn: 'Waze',
        mapsBtn: 'Карты',
        wa5minBtn: 'WhatsApp: 5 мин',
        callBtn: 'Позвонить',
        markPaid: 'Отметить оплату',
        paidDone: 'Оплачено ✓',
        btnOnTheWay: '🚗 Еду (5 мин)',
        btnPickedUp: '🛍️ Забрал',
        btnPhotoDone: '📸 Фото у бака и Готово',
        btnMarkDoneNoPhoto: '✓ Готово без фото',
        deleteBtn: 'Удалить',
        statsTodayRev: 'Касса сегодня',
        statsTodayCount: 'Выносов сегодня',
        statsActiveNow: 'Сейчас в работе',
        statsMonthRev: 'Касса за месяц',
        statsPaidVsUnpaid: 'Оплачено / Ждёт',
        qrHeadline: 'Сканируй QR и заказывай вынос мусора в 1 клик',
        qrSub: 'Визитка для клиентов • Иврит, Арабский и Русский',
        qrPrintBtn: 'Распечатать / сохранить PDF',
        qrCopyLink: 'Скопировать ссылку',
        settingsTitle: 'Настройки бизнеса, тарифов и оплаты картой',
        settingsSaved: 'Настройки сохранены!',
        saveSettingsBtn: 'Сохранить настройки',
        gatewayGuideTitle: 'Как подключить Visa / Mastercard на свой счёт в Израиле:',
        gatewayGuideDesc: 'Когда откроешь Осек Патур/Мурше и подключишь израильский эквайринг (Grow / Meshulam, PayPlus, Tranzila или Cardcom), просто вставь сюда платёжную ссылку или данные терминала — деньги будут капать прямо на твой бизнес-счёт.',
        logoutBtn: 'Выйти из панели курьера'
      },
      wa5minTemplate: 'Привет, {name}! Я курьер CleanDrop 👋 Буду у твоего дома ({street}) через 5 минут. Можно выставить пакет за дверь или позвоню в домофон.',
      waClientToCourier: 'Привет! По заказу {id} ({street}): '
    }
  };

  function getStoredLang() {
    try {
      const saved = localStorage.getItem('cleandrop_lang');
      if (saved && TRANSLATIONS[saved]) return saved;
    } catch (e) {}
    return 'he';
  }

  function applyLangToDom(lang) {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.he;
    document.documentElement.lang = lang;
    document.documentElement.dir = dict.dir;
    try {
      localStorage.setItem('cleandrop_lang', lang);
    } catch (e) {}
    return dict;
  }

  function fmt(template, vars) {
    let out = String(template || '');
    if (!vars) return out;
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(v ?? '');
    }
    return out;
  }

  global.CleanDropI18n = {
    TRANSLATIONS,
    getStoredLang,
    applyLangToDom,
    fmt
  };
})(window);
