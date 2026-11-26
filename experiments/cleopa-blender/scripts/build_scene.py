"""Rebuild the editable family scene or the standalone character assets."""
import argparse
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))

from animate_prayer import animate_family, animate_test, reusable, verify_contacts
from build_characters import create_character
from vector_art import Art, collection


def setup(title,width=16,fps=24,end=720,center=(0,0)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    bpy.context.preferences.filepaths.save_version=0
    scene.name=title
    camera_data=bpy.data.cameras.new('Orthographic lens')
    camera=bpy.data.objects.new('Orthographic camera',camera_data)
    scene.collection.objects.link(camera)
    camera.location=(*center,20)
    camera_data.type='ORTHO'
    camera_data.ortho_scale=width
    camera_data.passepartout_alpha=1
    scene.camera=camera
    scene.render.engine='BLENDER_WORKBENCH'
    scene.display.render_aa='8'
    shading=scene.display.shading
    shading.light='FLAT'
    shading.color_type='MATERIAL'
    shading.show_shadows=False
    shading.show_cavity=False
    shading.show_specular_highlight=False
    shading.show_object_outline=False
    scene.render.threads_mode='FIXED'
    scene.render.threads=4
    scene.render.resolution_x=1920
    scene.render.resolution_y=1080
    scene.render.resolution_percentage=100
    scene.render.fps=fps
    scene.render.fps_base=1
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGB'
    scene.render.image_settings.compression=12
    scene.frame_start=1
    scene.frame_end=end
    scene.view_settings.view_transform='Standard'
    scene.render.filter_size=1.18
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.region_3d.view_perspective='CAMERA'
                space.overlay.show_overlays=False
                space.shading.color_type='MATERIAL'
                space.shading.light='FLAT'
                space.shading.show_shadows=False
                space.shading.show_cavity=False
    return scene


def save(scene,path,rig=None):
    path.parent.mkdir(parents=True,exist_ok=True)
    scene.frame_set(1)
    if rig:
        bpy.context.view_layer.objects.active=rig
        rig.select_set(True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


def stage(floor=-1.73):
    coll=collection('STAGE • Character proof')
    a=Art('Warm paper',coll,z=-4)
    a.rect(-8,-5,8,7,'ddaa7f')
    a.oval(0,2.2,1.66,1.92,'efcba2')
    a.oval(0,2.2,1.78,2.06,'edc3a0','e8b991',.018)
    a.oval(0,2.2,1.61,1.87,'f2cfaa')
    a.line([(-8,floor),(8,floor)],'bd886d',.017)
    a.rect(-8,-5,8,floor-.01,'c89978')
    a.oval(0,floor+.01,1.19,.105,'b98469')
    for x in (-2.06,2.06):
        a.diamond(x,2.45,.089,.15,'eeca9d')
        a.diamond(x,2.45,.03,.051,'a6644f')
        a.line([(x,2.24),(x,1.27)],'c99475',.018)
        a.line([(x,2.65),(x,3.62)],'c99475',.018)
        a.diamond(x,1.12,.03,.046,'eeca9d')
        a.diamond(x,3.77,.03,.046,'eeca9d')
    a.finish()


def test():
    scene=setup('Cleopa • Orthodox cross study',width=6.95,end=108,center=(0,1.24))
    stage()
    character=create_character('cleopa')
    reusable(character)
    animate_test(character)
    scene.render.filepath='//../renders/cross_frames/frame_'
    for f,label in ((1,'Neutral'),(33,'Forehead'),(49,'Chest'),(64,'Right shoulder'),
                    (79,'Left shoulder'),(98,'Hand down'),(103,'Blink')):
        scene.timeline_markers.new(label,frame=f)
    verify_contacts(character,(33,49,64,79))
    save(scene,ROOT/'scenes'/'cleopa_cross_test.blend',character[1])


def export_set_assets():
    targets = (
        ("SET • Moldavian farmhouse", "backgrounds", "farmhouse.blend"),
        ("Bread, fruit and earthenware", "props", "tableware.blend"),
    )
    for name, folder, file in targets:
        path = ROOT / "assets" / folder / file
        path.parent.mkdir(parents=True, exist_ok=True)
        bpy.data.libraries.write(str(path), {bpy.data.collections[name]}, compress=True)


def family():
    from build_environment import build_room
    timing=json.loads((ROOT/'animations'/'timing.json').read_text())
    scene=setup('Cleopa • Prayer at the table',fps=timing['fps'],end=timing['frame_end'])
    scene.frame_start=timing['frame_start']
    build_room(scene)
    blocking=[(-6.18,-2.73),(-3.91,-2.64),(-1.52,-2.58),(.90,-2.66),(3.31,-2.73),(5.92,-2.72)]
    for index,(name,(x,y)) in enumerate(zip(timing['characters'],blocking)):
        character=create_character(name)
        character[1].location=(x,y,.026*index)
        reusable(character)
        animate_family(character,timing,index)
        offset=timing['offset_frames'][name]
        for frames in timing['contact_frames_leader'].values():
            verify_contacts(character,[frame+offset for frame in frames])
    for frame,label in ((1,'Settle'),(25,'Opening cross'),(44,'Forehead'),(60,'Chest'),
                        (76,'Right shoulder'),(92,'Left shoulder'),(121,'Prayer'),
                        (577,'Amen'),(601,'Closing cross'),(669,'Return')):
        scene.timeline_markers.new(label,frame=frame)
    scene.render.filepath='//../renders/frames/frame_'
    scene['audio']='Silent preview. See assets/audio/README.md for Romanian prayer and sync notes.'
    save(scene,ROOT/'scenes'/'prayer_at_table.blend')
    export_set_assets()


def library(name):
    scene=setup('Character library • '+name,width=11.8,end=98,center=(0,.93))
    character=create_character(name)
    reusable(character)
    rig=character[1]
    coll=character[2]
    coll.asset_mark()
    coll.asset_data.description='Complete vector cut-out and armature for '+character[0]['label']
    rig.animation_data.action=None
    for bone in rig.pose.bones:
        bone.matrix_basis=Matrix.Identity(4)
    for name_ in ('eye_pose','mouth_pose','hand_R_pose','hand_L_pose'):
        rig[name_]=0
    stage(-character[0]['leg']-.18)
    path=ROOT/'assets'/'characters'/name
    (path).mkdir(parents=True,exist_ok=True)
    keys=('head_w','head_h','head_y','shoulder_x','shoulder_y','upper','lower','hand','leg')
    manifest={'id':name,'label':character[0]['label'],'collection':coll.name,
              'armature':rig.name,'measurements':{k:character[0][k] for k in keys},
              'markers':list(character[3]),'art_source':'../../../scripts/build_characters.py',
              'actions':[action.name for action in bpy.data.actions]}
    (path/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    save(scene,path/(name+'.blend'),rig)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--test',action='store_true')
    parser.add_argument('--rigs',action='store_true')
    parser.add_argument('--set-assets',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.test:
        test()
    elif args.rigs:
        from build_characters import DESIGNS
        for name in DESIGNS:
            library(name)
    elif args.set_assets:
        export_set_assets()
    else:
        family()


if __name__=='__main__':
    main()
