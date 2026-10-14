# StreamVerse — database relationship map (Phase 3)

Textual ERD. `1—1` one-to-one, `1—N` one-to-many, `N—N` many-to-many (via a join table).

```
User (Phase 2)
 ├─1—N→ Content.createdBy            (nullable; SetNull if the user row ever goes away)
 ├─1—N→ LegalDocumentVersion.createdBy
 └─1—N→ AppSetting.updatedBy

Content                                   (one row per title, any type — the shared record)
 ├─1—1→ Movie        (Movie.contentId is also its PK; Cascade)
 ├─1—1→ Ebook        (Ebook.contentId is also its PK; Cascade)
 ├─1—1→ Audiobook    (Audiobook.contentId is also its PK; Cascade)
 ├─N—N→ Genre         via ContentGenre   (contentId, genreId)
 ├─N—N→ Tag           via ContentTag     (contentId, tagId)
 ├─N—N→ Language      via ContentLanguage(contentId, languageId, role)
 ├─N—N→ ContentWarningType via ContentWarning (contentId, warningTypeId)
 ├─1—N→ ContentTerritory  (contentId, countryCode — only meaningful when territoryMode != WORLDWIDE)
 ├─1—N→ MediaAsset    (contentId nullable; SetNull — an asset can outlive the content row)
 ├─1—N→ HomepageSectionItem.content   (Cascade)
 ├─1—N→ CollectionItem.content        (Cascade)
 └─1—N← Banner.linkedContent          (nullable; SetNull)

Movie
 ├─1—N→ MovieCast     (Cascade)
 ├─1—N→ MovieCrew     (Cascade)
 ├─1—N→ MovieCaption      --1—1→ MediaAsset (nullable, SetNull)   --N—1→ Language (Restrict)
 └─1—N→ MovieAudioTrack   --1—1→ MediaAsset (nullable, SetNull)   --N—1→ Language (Restrict)

Ebook
 └─1—N→ EbookEdition (Cascade) --N—1→ Language (Restrict)
          --1—1→ MediaAsset × 3 (epub / pdf / cover — each nullable, SetNull)

Audiobook
 ├─1—N→ AudiobookEdition (Cascade) --N—1→ Language (Restrict)
 │        --1—1→ MediaAsset × 2 (narratorImage / audio — nullable, SetNull)
 └─1—N→ AudiobookChapter (Cascade) --1—1→ MediaAsset (nullable, SetNull)
          unique(audiobookId, chapterNumber)

Genre  (slug unique; renaming `name` never touches ContentGenre rows)
Tag    (slug unique; case/whitespace-insensitive identity via the slug)
Language (code unique; "en", "es", "fr", ...)
ContentWarningType (key unique; fixed, seeded vocabulary)

ContentSequence (type PK) → the only source of MOV-/EBK-/AUD- numbers (see contentCode.service.ts)

LegalDocument (type unique, slug unique)
 ├─0—1→ currentPublishedVersion ─┐
 ├─0—1→ currentDraftVersion ─────┼─→ LegalDocumentVersion (1—N legalDocumentId; the FULL history)
 └─1—N→ versions ─────────────────┘      --N—1→ User.createdBy (nullable)

AppSetting (key PK — one row per known setting, not one column per setting)

HomepageSection (key unique; stable, unlike displayTitle)
 └─1—N→ HomepageSectionItem --N—1→ Content   unique(sectionId, contentId)

Collection (slug unique) --0—1→ MediaAsset (bannerAsset)
 └─1—N→ CollectionItem --N—1→ Content         unique(collectionId, contentId)

Banner --0—1→ MediaAsset (desktopAsset) --0—1→ MediaAsset (mobileAsset) --0—1→ Content (linkedContent)
```

## Delete-behavior summary

| Relationship | On parent delete |
| --- | --- |
| Content → Movie/Ebook/Audiobook | Cascade (meaningless without Content; primary path is soft-delete, not hard-delete) |
| Content → ContentGenre/Tag/Language/Warning/Territory | Cascade (pure join/metadata rows) |
| Content → HomepageSectionItem/CollectionItem | Cascade |
| Content → Banner.linkedContent | SetNull (the banner survives, just loses its link) |
| Content → MediaAsset | SetNull |
| Movie → Cast/Crew/Caption/AudioTrack | Cascade |
| Genre/Tag/Language/ContentWarningType referenced by content | Restrict — a genre/tag/language/warning type in active use cannot be deleted (service layer also checks this up front for genres with a clear message; language/tag have no delete API yet) |
| LegalDocument → LegalDocumentVersion | Cascade (rare: deleting a document type entirely) |

**Content itself is soft-deleted** (`deletedAt`), never hard-deleted by any code path in this phase — the
cascades above only matter for the rare manual/administrative hard delete, not the normal flow.
